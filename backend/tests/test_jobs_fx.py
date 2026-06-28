"""Scheduled-job harness + daily FX fetch tests (Story 3.7).

Mirrors `test_fx_providers.py`/`test_currency.py`: self-contained temp-DB engines (disposed in
finally — Windows WAL/SHM leak), monkeypatched `async_session_factory`. `/jobs/*` bypass
session/CSRF (`get_job_auth` only), so requests carry an `Authorization: Bearer` header, NOT a
session cookie. **Providers are monkeypatched — no network is ever hit.** Covers: job auth
(OIDC + shared-bearer), the happy per-currency fetch + history upsert, per-currency fallback,
base-never-fetched + keep-last-rate + never-null, FX_API_DOWN (raise/dedup/no-false-positive), and
multi-household independence.
"""

import tempfile
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_settings
from backend.database import get_db
from backend.main import create_app
from backend.models.base import Base
from backend.models.currency import Currency, FxProvider, FxRateHistory
from backend.models.identity import Household, Person
from backend.models.system import Alert
from backend.rate_limit import limiter
from backend.services import fx_fetch

_BEARER = "test-service-account-key"  # nosec B105 — a test fixture token, not a real secret


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _make_factory():
    tmp_dir = tempfile.mkdtemp()
    db_path = Path(tmp_dir) / "jobs_fx_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine, factory


def _client_with_db(factory, monkeypatch) -> TestClient:
    app = create_app()

    async def _override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    monkeypatch.setattr("backend.middleware.async_session_factory", factory)
    return TestClient(app)


async def _seed_household(factory, *, name="Acme") -> tuple[str, str]:
    """Household + its owner Person. Returns (owner_id, household_id)."""
    hh_id = str(uuid4())
    person_id = str(uuid4())
    async with factory() as db:
        db.add(
            Household(
                id=hh_id,
                name=name,
                base_currency="SGD",
                timezone="Asia/Singapore",
                created_by=person_id,
            )
        )
        await db.flush()
        db.add(
            Person(
                id=person_id,
                household_id=hh_id,
                email=f"{uuid4()}@example.com",
                display_name="Owner",
                role="owner",
                google_sub=f"sub-{uuid4()}",
            )
        )
        await db.commit()
    return person_id, hh_id


async def _seed_currency(
    factory,
    hh_id: str,
    code: str,
    *,
    is_base: bool = False,
    rate: Decimal = Decimal("1.0"),
    last_rate_at: datetime | None = None,
) -> str:
    cid = str(uuid4())
    async with factory() as db:
        db.add(
            Currency(
                id=cid,
                household_id=hh_id,
                code=code,
                name=code,
                symbol="$",
                is_base=is_base,
                is_display_active=True,
                rate_to_base=rate,
                fee_pct=Decimal("0"),
                last_rate_at=last_rate_at,
            )
        )
        await db.commit()
    return cid


async def _seed_provider(
    factory, hh_id: str, provider_type: str, priority: int, *, is_enabled: bool = True
) -> str:
    pid = str(uuid4())
    async with factory() as db:
        db.add(
            FxProvider(
                id=pid,
                household_id=hh_id,
                name=provider_type,
                provider_type=provider_type,
                base_url="https://example.test",
                api_key_secret_ref=None,
                priority=priority,
                is_enabled=is_enabled,
            )
        )
        await db.commit()
    return pid


class _FakeProvider:
    """Returns fixed native-relative rates; a code absent from `rates` simulates a missing symbol
    (the walker treats it as a failure for that currency). `fail=True` simulates a down provider."""

    def __init__(self, name: str, rates: dict[str, Decimal], *, fail: bool = False) -> None:
        self.name = name
        self._rates = rates
        self._fail = fail

    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]:
        if self._fail:
            raise RuntimeError("provider down")
        wanted = {base, *targets}
        return {k: v for k, v in self._rates.items() if k in wanted}


def _patch_providers(monkeypatch, mapping: dict[str, _FakeProvider]) -> None:
    """Map provider_type → fake impl, replacing the real env/httpx-backed `_build_provider`."""
    monkeypatch.setattr(fx_fetch, "_build_provider", lambda row: mapping.get(row.provider_type))


def _refresh(client: TestClient, bearer: str | None = _BEARER):
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    return client.post("/jobs/fx-refresh", headers=headers)


async def _currency(factory, cid: str) -> Currency:
    async with factory() as db:
        return await db.get(Currency, cid)


async def _alerts(factory, hh_id: str) -> list[Alert]:
    async with factory() as db:
        return list(
            (await db.execute(select(Alert).where(Alert.household_id == hh_id))).scalars().all()
        )


# ── Job auth (AC1) ──


async def test_no_auth_header_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client, bearer=None).status_code == 401
    finally:
        await engine.dispose()


async def test_wrong_bearer_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client, bearer="nope").status_code == 401
    finally:
        await engine.dispose()


async def test_shared_bearer_200(monkeypatch):
    engine, factory = await _make_factory()
    try:
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        resp = _refresh(client)
        assert resp.status_code == 200
        assert resp.json()["households"] == 0
    finally:
        await engine.dispose()


async def test_oidc_email_match_200_mismatch_401(monkeypatch):
    engine, factory = await _make_factory()
    try:
        settings = get_settings()
        monkeypatch.setattr(settings, "service_account_key", "", raising=False)  # bearer off
        monkeypatch.setattr(settings, "service_url", "https://svc.run.app", raising=False)
        monkeypatch.setattr(settings, "job_invoker_sa", "scheduler@proj.iam", raising=False)

        def _fake_verify(token, request, audience, clock_skew_in_seconds):
            return {"email": "scheduler@proj.iam", "aud": audience}

        monkeypatch.setattr(
            "backend.dependencies.google_id_token.verify_oauth2_token", _fake_verify
        )
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client, bearer="any-oidc-jwt").status_code == 200

        # A token whose email is not JOB_INVOKER_SA is rejected.
        monkeypatch.setattr(
            "backend.dependencies.google_id_token.verify_oauth2_token",
            lambda token, request, audience, clock_skew_in_seconds: {"email": "evil@proj.iam"},
        )
        assert _refresh(client, bearer="any-oidc-jwt").status_code == 401
    finally:
        await engine.dispose()


# ── Happy fetch + history (AC2) ──


async def test_happy_fetch_sets_rate_direction_and_history(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        base = await _seed_currency(factory, hh, "SGD", is_base=True)
        nzd = await _seed_currency(factory, hh, "NZD")
        await _seed_provider(factory, hh, "openexchangerates", 0)
        # USD-native rates: rate_to_base(NZD) = rates[SGD]/rates[NZD] => 1 NZD in SGD.
        rates = {"USD": Decimal("1"), "SGD": Decimal("0.74"), "NZD": Decimal("0.60")}
        _patch_providers(monkeypatch, {"openexchangerates": _FakeProvider("oxr", rates)})

        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        resp = _refresh(client)
        assert resp.status_code == 200
        assert resp.json()["currencies_updated"] == 1

        nzd_row = await _currency(factory, nzd)
        expected = (Decimal("0.74") / Decimal("0.60")).quantize(Decimal("0.000001"))
        assert nzd_row.rate_to_base == expected  # amount_base = amount × rate_to_base
        assert nzd_row.last_rate_at is not None
        assert nzd_row.rate_source == "oxr"
        base_row = await _currency(factory, base)
        assert base_row.rate_to_base == Decimal("1.0")  # base never fetched

        async with factory() as db:
            hist = (
                (await db.execute(select(FxRateHistory).where(FxRateHistory.currency_id == nzd)))
                .scalars()
                .all()
            )
        assert len(hist) == 1
        assert hist[0].rate_date == datetime.now(UTC).date()  # UTC-consistent rate_date
        assert hist[0].rate_to_base == expected

        # Second same-day run updates the row, never duplicates (UNIQUE upsert).
        assert _refresh(client).status_code == 200
        async with factory() as db:
            hist2 = (
                (await db.execute(select(FxRateHistory).where(FxRateHistory.currency_id == nzd)))
                .scalars()
                .all()
            )
        assert len(hist2) == 1
    finally:
        await engine.dispose()


async def test_per_currency_fallback(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        await _seed_currency(factory, hh, "SGD", is_base=True)
        nzd = await _seed_currency(factory, hh, "NZD")
        usd = await _seed_currency(factory, hh, "USD")
        await _seed_provider(factory, hh, "openexchangerates", 0)  # has NZD, missing USD
        await _seed_provider(factory, hh, "frankfurter", 1)  # has USD
        provider_a = _FakeProvider(
            "oxr", {"USD": Decimal("1"), "SGD": Decimal("0.74"), "NZD": Decimal("0.60")}
        )
        # Frankfurter is EUR-native here but only needs to serve USD for this test.
        provider_b = _FakeProvider(
            "frank", {"EUR": Decimal("1"), "SGD": Decimal("1.45"), "USD": Decimal("1.08")}
        )
        # Provider A omits USD from what it can serve → force a miss by removing USD from its dict.
        provider_a._rates.pop("USD")  # noqa: SLF001 — test shaping the fake's coverage
        _patch_providers(monkeypatch, {"openexchangerates": provider_a, "frankfurter": provider_b})

        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client).status_code == 200

        nzd_row = await _currency(factory, nzd)
        usd_row = await _currency(factory, usd)
        assert nzd_row.rate_source == "oxr"  # A served NZD
        assert usd_row.rate_source == "frank"  # fell back to B for USD
    finally:
        await engine.dispose()


# ── Resilience (AC3) ──


async def test_all_fail_keeps_last_rate_never_null(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        await _seed_currency(factory, hh, "SGD", is_base=True)
        # A currency with a known prior rate + recent timestamp; and a brand-new one (seed 1.0).
        recent = datetime.now(UTC) - timedelta(hours=1)
        known = await _seed_currency(
            factory, hh, "NZD", rate=Decimal("1.230000"), last_rate_at=recent
        )
        fresh = await _seed_currency(factory, hh, "USD")  # rate 1.0, last_rate_at None
        await _seed_provider(factory, hh, "openexchangerates", 0)
        _patch_providers(monkeypatch, {"openexchangerates": _FakeProvider("oxr", {}, fail=True)})

        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        resp = _refresh(client)
        assert resp.json()["currencies_failed"] == 2

        known_row = await _currency(factory, known)
        fresh_row = await _currency(factory, fresh)
        assert known_row.rate_to_base == Decimal("1.230000")  # kept, not overwritten
        # untouched on failure (SQLite returns naive; same wall-clock UTC instant)
        assert known_row.last_rate_at.replace(tzinfo=UTC) == recent
        assert fresh_row.rate_to_base == Decimal("1.0")  # never null (seed kept)
        assert fresh_row.last_rate_at is None

        # Provider marked down.
        async with factory() as db:
            prov = (
                (await db.execute(select(FxProvider).where(FxProvider.household_id == hh)))
                .scalars()
                .first()
            )
        assert prov.last_status == "down"
        assert prov.last_checked_at is not None
    finally:
        await engine.dispose()


async def test_fx_api_down_raised_deduped_and_not_false_positive(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        owner_id = _owner
        await _seed_currency(factory, hh, "SGD", is_base=True)
        # Stale beyond 72h → an all-fail run should raise FX_API_DOWN.
        stale = datetime.now(UTC) - timedelta(hours=80)
        await _seed_currency(factory, hh, "NZD", last_rate_at=stale)
        await _seed_provider(factory, hh, "openexchangerates", 0)
        _patch_providers(monkeypatch, {"openexchangerates": _FakeProvider("oxr", {}, fail=True)})

        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client).json()["alerts_raised"] == 1

        alerts = await _alerts(factory, hh)
        assert len(alerts) == 1
        assert alerts[0].alert_type == "FX_API_DOWN"
        assert alerts[0].created_by == owner_id  # owner = system actor

        # A second failing run does NOT duplicate (dedup on undismissed).
        assert _refresh(client).json()["alerts_raised"] == 0
        assert len(await _alerts(factory, hh)) == 1
    finally:
        await engine.dispose()


async def test_no_alert_when_recent_or_successful(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        await _seed_currency(factory, hh, "SGD", is_base=True)
        # Recent last_rate_at (< 72h) → a single failure must NOT raise FX_API_DOWN.
        recent = datetime.now(UTC) - timedelta(hours=10)
        await _seed_currency(factory, hh, "NZD", last_rate_at=recent)
        await _seed_provider(factory, hh, "openexchangerates", 0)
        _patch_providers(monkeypatch, {"openexchangerates": _FakeProvider("oxr", {}, fail=True)})
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        assert _refresh(client).json()["alerts_raised"] == 0
        assert await _alerts(factory, hh) == []

        # Now a successful run also raises no alert.
        _patch_providers(
            monkeypatch,
            {
                "openexchangerates": _FakeProvider(
                    "oxr", {"SGD": Decimal("0.74"), "NZD": Decimal("0.60")}
                )
            },
        )
        assert _refresh(client).json()["alerts_raised"] == 0
        assert await _alerts(factory, hh) == []
    finally:
        await engine.dispose()


# ── Seed-in-job (review patch — AC2 completeness) ──


async def test_unseeded_household_gets_seeded_and_fetches(monkeypatch):
    """A household with currencies but NO providers (never opened Integrations) must still get the
    keyless Frankfurter fallback seeded by the job and fetch rates — not silently no-op + alarm."""
    engine, factory = await _make_factory()
    try:
        _owner, hh = await _seed_household(factory)
        await _seed_currency(factory, hh, "SGD", is_base=True)
        nzd = await _seed_currency(factory, hh, "NZD")
        # No _seed_provider — the household starts with zero FX providers.
        # Frankfurter is EUR-native; seeded enabled (keyless). OXR seeds disabled (no key in env).
        _patch_providers(
            monkeypatch,
            {
                "frankfurter": _FakeProvider(
                    "frankfurter", {"SGD": Decimal("1.45"), "NZD": Decimal("1.10")}
                )
            },
        )
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        resp = _refresh(client)
        assert resp.status_code == 200
        assert resp.json()["currencies_updated"] == 1
        assert resp.json()["alerts_raised"] == 0  # no spurious FX_API_DOWN

        # The default chain was seeded (Frankfurter + OXR), and NZD resolved via the keyless one.
        async with factory() as db:
            provs = (
                (await db.execute(select(FxProvider).where(FxProvider.household_id == hh)))
                .scalars()
                .all()
            )
        assert {p.provider_type for p in provs} == {"frankfurter", "openexchangerates"}
        nzd_row = await _currency(factory, nzd)
        assert nzd_row.rate_source == "frankfurter"
        assert nzd_row.last_rate_at is not None
        assert await _alerts(factory, hh) == []
    finally:
        await engine.dispose()


# ── Provider building / base_url hardening (review) ──


def test_build_provider_normalizes_missing_scheme():
    """A base_url saved without a scheme (e.g. an owner edits Frankfurter to 'api.frankfurter.dev')
    is defaulted to https so httpx can call it; an already-schemed URL is untouched; an unknown
    type yields None."""
    schemeless = FxProvider(
        provider_type="frankfurter",
        base_url="api.frankfurter.dev",
        api_key_secret_ref=None,
        name="f",
        priority=1,
        is_enabled=True,
    )
    built = fx_fetch._build_provider(schemeless)
    assert built is not None
    assert built._base_url == "https://api.frankfurter.dev"

    schemed = FxProvider(
        provider_type="openexchangerates",
        base_url="https://openexchangerates.org/api/",
        api_key_secret_ref=None,
        name="o",
        priority=0,
        is_enabled=True,
    )
    assert fx_fetch._build_provider(schemed)._base_url == "https://openexchangerates.org/api"

    unknown = FxProvider(
        provider_type="madeup",
        base_url="x",
        api_key_secret_ref=None,
        name="m",
        priority=0,
        is_enabled=True,
    )
    assert fx_fetch._build_provider(unknown) is None


# ── Multi-household (AC2) ──


async def test_multi_household_independent(monkeypatch):
    engine, factory = await _make_factory()
    try:
        _o1, hh1 = await _seed_household(factory, name="One")
        _o2, hh2 = await _seed_household(factory, name="Two")
        await _seed_currency(factory, hh1, "SGD", is_base=True)
        nzd1 = await _seed_currency(factory, hh1, "NZD")
        await _seed_currency(factory, hh2, "SGD", is_base=True)
        nzd2 = await _seed_currency(factory, hh2, "NZD")
        await _seed_provider(factory, hh1, "openexchangerates", 0)
        await _seed_provider(factory, hh2, "openexchangerates", 0)
        _patch_providers(
            monkeypatch,
            {
                "openexchangerates": _FakeProvider(
                    "oxr", {"SGD": Decimal("0.74"), "NZD": Decimal("0.60")}
                )
            },
        )
        monkeypatch.setattr(get_settings(), "service_account_key", _BEARER, raising=False)
        client = _client_with_db(factory, monkeypatch)
        resp = _refresh(client)
        assert resp.json()["households"] == 2
        assert resp.json()["currencies_updated"] == 2
        assert (await _currency(factory, nzd1)).last_rate_at is not None
        assert (await _currency(factory, nzd2)).last_rate_at is not None
    finally:
        await engine.dispose()
