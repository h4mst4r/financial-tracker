"""Check database tables and initialize if needed."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'financial_tracker.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Existing tables:", [t[0] for t in tables])

# Check if HouseholdInvitation exists
if not any(t[0] == 'HouseholdInvitation' for t in tables):
    print("\nERROR: HouseholdInvitation table is MISSING!")
    print("The table needs to be created.")
else:
    print("\nHouseholdInvitation table exists.")
    cursor.execute("SELECT COUNT(*) FROM HouseholdInvitation")
    count = cursor.fetchone()[0]
    print(f"Total invitations: {count}")
    
    # Show all invitations
    cursor.execute("SELECT id, email, status, household_id FROM HouseholdInvitation")
    rows = cursor.fetchall()
    for row in rows:
        print(f"  ID: {row[0]}, Email: {row[1]}, Status: {row[2]}, Household: {row[3]}")

conn.close()
