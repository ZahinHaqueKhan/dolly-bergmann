import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-stone-800 text-stone-300 py-12">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <h3 className="text-lg font-serif text-white mb-4">ModestWear</h3>
          <p className="text-sm">Elegant modest fashion for every occasion.</p>
        </div>
        <div>
          <h4 className="text-white font-medium mb-4">Shop</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/shop?category=dresses">Dresses</Link></li>
            <li><Link href="/shop?category=khimar">Khimar</Link></li>
            <li><Link href="/shop">All Products</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-medium mb-4">Help</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/shipping">Shipping</Link></li>
            <li><Link href="/returns">Returns</Link></li>
            <li><Link href="/size-guide">Size Guide</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-medium mb-4">Newsletter</h4>
          <p className="text-sm mb-2">Get updates on new arrivals.</p>
          <form className="flex">
            <input type="email" placeholder="Your email" className="flex-1 px-3 py-2 rounded-l text-stone-900 text-sm" />
            <button type="button" className="bg-rose-500 text-white px-4 py-2 rounded-r text-sm">Join</button>
          </form>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 mt-8 pt-8 border-t border-stone-700 text-sm text-center">
        &copy; 2025 ModestWear. All rights reserved.
      </div>
    </footer>
  )
}