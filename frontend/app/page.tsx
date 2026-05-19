import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";

const FEATURED_PRODUCTS = [
  { id: 1, name: "Classic Black Khimar", slug: "classic-black-khimar", price: 49, images: ["/products/khimar-black.jpg"] },
  { id: 2, name: "Beige Maxi Dress", slug: "beige-maxi-dress", price: 129, images: ["/products/dress-beige.jpg"] },
  { id: 3, name: "Navy Jersey Khimar", slug: "navy-jersey-khimar", price: 39, images: ["/products/khimar-navy.jpg"] },
  { id: 4, name: "Dusty Rose Abaya", slug: "dusty-rose-abaya", price: 159, images: ["/products/abaya-rose.jpg"] },
];

export default function HomePage() {
  return (
    <div>
      <section className="relative bg-stone-100 py-20 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-rose-500 font-medium mb-2 tracking-wide uppercase text-sm">New Collection 2025</p>
            <h1 className="text-5xl md:text-6xl font-serif text-stone-800 leading-tight mb-6">
              Elegance in<br />Modesty
            </h1>
            <p className="text-stone-600 text-lg mb-8 max-w-md">
              Discover our curated collection of modest fashion — from flowing khimar to elegant dresses, designed for the modern Muslim woman.
            </p>
            <div className="flex gap-4">
              <Link href="/shop" className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700 transition-colors">
                Shop Now
              </Link>
              <Link href="/size-guide" className="border border-stone-300 text-stone-700 px-6 py-3 rounded-full font-medium hover:bg-stone-100 transition-colors">
                Size Guide
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-stone-200">
            <Image src="/hero.jpg" alt="Modest fashion collection" fill className="object-cover" priority />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif text-stone-800 mb-3">Shop by Category</h2>
          <p className="text-stone-500">Find your perfect style</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { name: "Khimar", slug: "khimar", image: "/category-khimar.jpg", count: 24 },
            { name: "Dresses", slug: "dresses", image: "/category-dresses.jpg", count: 18 },
            { name: "Abaya", slug: "abaya", image: "/category-abaya.jpg", count: 12 },
            { name: "Sets", slug: "sets", image: "/category-sets.jpg", count: 8 },
          ].map((cat) => (
            <Link key={cat.slug} href={`/shop?category=${cat.slug}`} className="group relative aspect-square rounded-xl overflow-hidden bg-stone-100">
              <Image src={cat.image} alt={cat.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 text-white">
                <p className="font-serif text-lg">{cat.name}</p>
                <p className="text-sm text-white/70">{cat.count} items</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-stone-100 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-3xl font-serif text-stone-800">Featured Products</h2>
              <p className="text-stone-500 mt-1">Our most loved pieces</p>
            </div>
            <Link href="/shop" className="text-stone-600 hover:text-stone-800 font-medium flex items-center gap-1">
              View all <span>→</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {FEATURED_PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-8 bg-white rounded-xl border border-stone-100">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </div>
            <h3 className="font-serif text-lg text-stone-800 mb-2">Free Shipping</h3>
            <p className="text-stone-500 text-sm">On orders over $100. Fast & reliable delivery.</p>
          </div>
          <div className="text-center p-8 bg-white rounded-xl border border-stone-100">
            <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <h3 className="font-serif text-lg text-stone-800 mb-2">Secure Payment</h3>
            <p className="text-stone-500 text-sm">SSL encrypted checkout. All major cards accepted.</p>
          </div>
          <div className="text-center p-8 bg-white rounded-xl border border-stone-100">
            <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </div>
            <h3 className="font-serif text-lg text-stone-800 mb-2">Easy Returns</h3>
            <p className="text-stone-500 text-sm">30-day hassle-free returns policy.</p>
          </div>
        </div>
      </section>

      <section className="bg-stone-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-serif mb-4">Find Your Perfect Size</h2>
          <p className="text-stone-300 mb-6 max-w-md mx-auto">Not sure which size to order? Use our interactive size guide with body measurement recommendations.</p>
          <Link href="/size-guide" className="inline-block bg-white text-stone-800 px-6 py-3 rounded-full font-medium hover:bg-stone-100 transition-colors">
            View Size Guide
          </Link>
        </div>
      </section>
    </div>
  );
}