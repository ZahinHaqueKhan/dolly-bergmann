"""Products router: public list, detail by slug, search, category filter."""
import pytest


@pytest.mark.asyncio
async def test_list_products_returns_array(client):
    r = await client.get("/api/products")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) > 0
    # Each product has the expected shape.
    for p in body[:5]:
        assert "id" in p
        assert "slug" in p
        assert "name" in p
        assert "variants" in p


@pytest.mark.asyncio
async def test_list_products_search(client, sample_product):
    """The search endpoint matches against the product's name or
    description (per backend contract). We search by the product's
    NAME (which always contains the unique run_id) so the seeded
    test product is reliably found.
    """
    # Pull a unique substring of the product name.
    name_token = sample_product["name"].split()[-1]  # the run_id
    r = await client.get(
        "/api/products", params={"search": name_token}
    )
    assert r.status_code == 200
    body = r.json()
    slugs = [p["slug"] for p in body]
    assert sample_product["slug"] in slugs, (
        f"slug {sample_product['slug']!r} not in search results: {body[:3]}"
    )


@pytest.mark.asyncio
async def test_list_products_size_filter(client, sample_product):
    r = await client.get(
        "/api/products", params={"size": "M"}
    )
    assert r.status_code == 200
    body = r.json()
    # Every product returned should have at least one M-size variant.
    for p in body:
        sizes = {v["size"] for v in p["variants"]}
        assert "M" in sizes


@pytest.mark.asyncio
async def test_get_product_by_slug(client, sample_product):
    r = await client.get(f"/api/products/{sample_product['slug']}")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == sample_product["slug"]
    assert body["is_active"] is True
    assert len(body["variants"]) == 1
    assert body["variants"][0]["sku"] == sample_product["variant_sku"]


@pytest.mark.asyncio
async def test_get_unknown_product_404(client):
    r = await client.get("/api/products/no-such-slug-xyz")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_admin_create_product(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    slug = f"admin-test-product-{run_id}"
    payload = {
        "name": f"Admin Test Product {run_id}",
        "slug": slug,
        "description": "Created by pytest.",
        "category": f"pytest-cat-{run_id}",
        "images": [],
        "tags": ["pytest"],
        "variants": [
            {
                "size": "S",
                "color": "Red",
                "price": 2500,
                "stock": 10,
                "sku": f"PYTEST-S-RED-{run_id}",
            },
            {
                "size": "M",
                "color": "Red",
                "price": 2500,
                "stock": 5,
                "sku": f"PYTEST-M-RED-{run_id}",
            },
        ],
    }
    r = await client.post("/api/products", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "id" in body
    assert body["slug"] == slug


@pytest.mark.asyncio
async def test_admin_create_product_requires_admin(client, sample_user):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/products",
        json={
            "name": "Should Fail",
            "slug": "should-fail",
            "description": "x",
            "category": "x",
            "variants": [{"size": "S", "color": "X", "price": 100, "stock": 1}],
        },
        headers=headers,
    )
    assert r.status_code == 403
