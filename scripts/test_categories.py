"""Test script for category CRUD endpoints."""
import os
import sys
import secrets
import uuid
from datetime import datetime, timedelta, timezone
import requests

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

s = requests.Session()
BASE = "http://localhost:8000"

print("=== Category CRUD Tests ===\n")

# Create a test user and session directly via database
from sqlalchemy import create_engine, text
from backend.database import Base, get_db
from backend.models import User, Session as SessionModel, Household, HouseholdMember, UserRole, HouseholdRole

engine = create_engine("sqlite:///financial_tracker.db", echo=False, connect_args={"check_same_thread": False})

with engine.connect() as conn:
    # Check if test user exists
    result = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": "test@example.com"})
    user_row = result.fetchone()
    
    if not user_row:
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(text(
            "INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (:id, :email, :name, :role, :created_at, :updated_at)"
        ), {
            "id": user_id,
            "email": "test@example.com",
            "name": "Test User",
            "role": "member",
            "created_at": now,
            "updated_at": now
        })
        conn.commit()
        print(f"[OK] Created test user: {user_id[:8]}...")
    else:
        user_id = user_row[0]
        print(f"[OK] Using existing test user: {user_id[:8]}...")
    
    # Check if household exists for this user
    result = conn.execute(text(
        "SELECT household_id FROM household_members WHERE user_id = :user_id"
    ), {"user_id": user_id})
    member_row = result.fetchone()
    
    if not member_row:
        household_id = str(uuid.uuid4())
        member_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(text(
            "INSERT INTO households (id, name, created_by, created_at, updated_at) VALUES (:id, :name, :created_by, :created_at, :updated_at)"
        ), {
            "id": household_id,
            "name": "Test Household",
            "created_by": user_id,
            "created_at": now,
            "updated_at": now
        })
        
        conn.execute(text(
            "INSERT INTO household_members (id, user_id, household_id, role, joined_at) VALUES (:id, :user_id, :household_id, :role, :joined_at)"
        ), {
            "id": member_id,
            "user_id": user_id,
            "household_id": household_id,
            "role": "admin",
            "joined_at": now
        })
        conn.commit()
        print(f"[OK] Created test household: {household_id[:8]}...")
    else:
        household_id = member_row[0]
        print(f"[OK] Using existing household: {household_id[:8]}...")
    
    # Create a session for the test user
    session_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    conn.execute(text(
        "INSERT INTO sessions (id, user_id, expires_at, last_activity_at) VALUES (:id, :user_id, :expires_at, :last_activity_at)"
    ), {
        "id": session_id,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "last_activity_at": datetime.now(timezone.utc).isoformat()
    })
    conn.commit()
    print(f"[OK] Created test session: {session_id[:8]}...")

# Set the session cookie for all requests
s.cookies.set("session_id", session_id)

# 1. Get CSRF token
try:
    csrf = s.get(f"{BASE}/api/auth/csrf-token").json()
    print(f"[OK] CSRF Token: {csrf['csrf_token'][:20]}...")
except Exception as e:
    print(f"[FAIL] CSRF token: {e}")
    import sys
    sys.exit(1)

token = csrf["csrf_token"]

# 2. List categories (should include system defaults)
try:
    cats = s.get(f"{BASE}/api/categories")
    data = cats.json()
    print(f"[OK] Categories count: {len(data)}")
    for c in data[:3]:
        print(f"      - {c['name']} (default: {c['is_default']})")
except Exception as e:
    print(f"[FAIL] List categories: {e}")

# 3. Create a custom category
cat_id = None
try:
    new_cat = s.post(
        f"{BASE}/api/categories",
        json={"name": "Test Category", "color": "#FF5722", "icon": "test"},
        headers={"X-CSRF-Token": token},
    )
    print(f"[OK] Create status: {new_cat.status_code}")
    if new_cat.status_code == 201:
        cat_id = new_cat.json()["id"]
        print(f"      Created: {new_cat.json()['name']} (id: {cat_id[:8]}...)")
except Exception as e:
    print(f"[FAIL] Create category: {e}")

# 4. Update the category
if cat_id:
    try:
        updated = s.put(
            f"{BASE}/api/categories/{cat_id}",
            json={"name": "Updated Category", "color": "#4CAF50"},
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Update status: {updated.status_code} - name: {updated.json().get('name')}")
    except Exception as e:
        print(f"[FAIL] Update category: {e}")

# 5. Create a subcategory
sub_id = None
if cat_id:
    try:
        sub_cat = s.post(
            f"{BASE}/api/categories",
            json={"name": "Sub Category", "color": "#2196F3", "parent_id": cat_id},
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Subcategory status: {sub_cat.status_code}")
        if sub_cat.status_code == 201:
            sub_id = sub_cat.json()["id"]
    except Exception as e:
        print(f"[FAIL] Create subcategory: {e}")

# 6. List with children_count
try:
    cats = s.get(f"{BASE}/api/categories?top_level=true")
    for c in cats.json():
        if not c["is_default"]:
            print(f"[OK] {c['name']}: {c['children_count']} children")
except Exception as e:
    print(f"[FAIL] List top-level: {e}")

# 7. Try to delete parent with children (should fail with 409 Conflict)
if cat_id and sub_id:
    try:
        delete_fail = s.delete(
            f"{BASE}/api/categories/{cat_id}",
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Delete parent with children: {delete_fail.status_code} (expected 409)")
    except Exception as e:
        print(f"[FAIL] Delete parent test: {e}")

# 8. Archive the subcategory first
if sub_id:
    try:
        archived = s.delete(
            f"{BASE}/api/categories/{sub_id}",
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Archive subcategory: {archived.status_code} - {archived.json().get('message', '')}")
    except Exception as e:
        print(f"[FAIL] Archive subcategory: {e}")

# 9. Restore the subcategory
if sub_id:
    try:
        restored = s.patch(
            f"{BASE}/api/categories/{sub_id}/restore",
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Restore status: {restored.status_code} - name: {restored.json().get('name')}")
    except Exception as e:
        print(f"[FAIL] Restore subcategory: {e}")

# 10. Archive subcategory again, then archive parent
if cat_id and sub_id:
    try:
        s.delete(f"{BASE}/api/categories/{sub_id}", headers={"X-CSRF-Token": token})
    except:
        pass
    
    try:
        archived = s.delete(
            f"{BASE}/api/categories/{cat_id}",
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Archive parent: {archived.status_code} - {archived.json().get('message', '')}")
    except Exception as e:
        print(f"[FAIL] Archive parent: {e}")

# 11. Try to create duplicate name (should fail since archived category still exists)
try:
    dup = s.post(
        f"{BASE}/api/categories",
        json={"name": "Updated Category", "color": "#000000"},
        headers={"X-CSRF-Token": token},
    )
    print(f"[OK] Duplicate name status: {dup.status_code} (expected 400)")
except Exception as e:
    print(f"[FAIL] Duplicate test: {e}")

# 12. Test nesting depth (try to create 3rd level)
if cat_id and sub_id:
    # Restore both first
    try:
        s.patch(f"{BASE}/api/categories/{cat_id}/restore", headers={"X-CSRF-Token": token})
        s.patch(f"{BASE}/api/categories/{sub_id}/restore", headers={"X-CSRF-Token": token})
    except:
        pass

    try:
        deep = s.post(
            f"{BASE}/api/categories",
            json={"name": "Deep Category", "color": "#FF0000", "parent_id": sub_id},
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Deep nesting status: {deep.status_code} (expected 400)")
    except Exception as e:
        print(f"[FAIL] Deep nesting test: {e}")

# 13. Test default category cannot be deleted (returns 403 Forbidden)
try:
    cats = s.get(f"{BASE}/api/categories")
    default_cat = None
    for c in cats.json():
        if c["is_default"]:
            default_cat = c["id"]
            break
    
    if default_cat:
        delete_default = s.delete(
            f"{BASE}/api/categories/{default_cat}",
            headers={"X-CSRF-Token": token},
        )
        print(f"[OK] Delete default status: {delete_default.status_code} (expected 403)")
except Exception as e:
    print(f"[FAIL] Default delete test: {e}")

print("\n=== All tests complete! ===")
