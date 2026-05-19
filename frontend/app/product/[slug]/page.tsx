import Image from "next/image";
import { notFound } from "next/navigation";

interface Variant {
  id: number;
  size: string;
  color: string;
  price: number;
  stock: number;
}

const MOCK_PRODUCT = {
  id: 1,
  name: "Classic Black Khimar",
  slug: "classic-black-khimar",
  description: "Our bestselling classic black khimar, crafted from premium jersey fabric that drapes beautifully. Features a secure magnetic closure and adjustable height. Perfect for everyday wear or special occasions.\n\n- Premium jersey fabric\n- Magnetic secure closure\n- Adjustable height\n- Machine washable\n- Available in multiple sizes",
  price: 49,
  images: ["/products/khimar-black.jpg", "/products/khimar-black-2.jpg"],
  category: "khimar",
  variants: [
    { id: 1, size: "S/M", color: "Black", price: 49, stock: 12 },
    { id: 2, size: "M/L", color: "Black", price: 49, stock: 8 },
    { id: 3, size: "S/M", color: "Navy", price: 49, stock: 5 },
    { id: 4, size: "M/L", color: "Navy", price: 49, stock: 3 },
  ] as Variant[],
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<ReturnType<typeof generateMetadata>> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug } = await params
  return {
    title: `${MOCK_PRODUCT.name} — ModestWear`,
    description: MOCK_PRODUCT.description.slice(0, 160),
    openGraph: {
      title: MOCK_PRODUCT.name,
      images: MOCK_PRODUCT.images,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== MOCK_PRODUCT.slug) notFound();

  const product = MOCK_PRODUCT;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description,
    "image": product.images,
    "offers": {
      "@type": "Offer",
      "price": product.price,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
    },
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="text-sm text-stone-500 mb-6">
          <a href="/shop" className="hover:text-stone-700">Shop</a> / <a href={`/shop?category=${product.category}`} className="hover:text-stone-700 capitalize">{product.category}</a> / {product.name}
        </nav>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-100">
              <Image src={product.images[0]} alt={product.name} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 50vw" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {product.images.map((img, i) => (
                <button key={i} className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 border-2 border-transparent hover:border-stone-300">
                  <Image src={img} alt={`${product.name} view ${i + 1}`} fill className="object-cover" sizes="100px" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-serif text-stone-800 mb-3">{product.name}</h1>
            <p className="text-2xl text-stone-700 mb-6">${product.price}</p>

            <div className="mb-6">
              <p className="font-medium text-stone-700 mb-2">Size</p>
              <div className="flex gap-2">
                {['S/M', 'M/L', 'L/XL'].map(size => (
                  <button key={size} className="px-4 py-2 border border-stone-300 rounded-lg text-sm hover:border-stone-500 transition-colors">{size}</button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <p className="font-medium text-stone-700 mb-2">Color</p>
              <div className="flex gap-2">
                {['Black', 'Navy', 'Burgundy'].map(color => (
                  <button key={color} className="px-4 py-2 border border-stone-300 rounded-lg text-sm capitalize hover:border-stone-500 transition-colors">{color}</button>
                ))}
              </div>
            </div>

            <button className="w-full bg-stone-800 text-white py-4 rounded-full font-medium text-lg hover:bg-stone-700 transition-colors mb-4">
              Add to Cart
            </button>
            <button className="w-full border border-stone-300 text-stone-700 py-4 rounded-full font-medium hover:bg-stone-50 transition-colors">
              Add to Wishlist
            </button>

            <div className="mt-8 space-y-4">
              {[
                { label: "Free shipping on orders over $100", icon: "🚚" },
                { label: "30-day easy returns", icon: "↩" },
                { label: "Secure checkout", icon: "🔒" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3 text-sm text-stone-600">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-stone-200 pt-8">
          <div className="flex gap-8 mb-8">
            {['Details', 'Size Guide', 'Reviews'].map(tab => (
              <button key={tab} className={`font-medium pb-2 border-b-2 ${tab === 'Details' ? 'border-stone-800 text-stone-800' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="prose prose-stone max-w-2xl">
            <p className="whitespace-pre-line text-stone-600">{product.description}</p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-serif text-stone-800 mb-6">You May Also Like</h2>
          <div className="grid grid-cols-4 gap-6">
            {[2, 3, 6, 8].map(id => (
              <div key={id} className="aspect-[3/4] rounded-lg bg-stone-100 relative overflow-hidden">
                <Image src={`/products/item-${id}.jpg`} alt="Related product" fill className="object-cover" sizes="25vw" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}