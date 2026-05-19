export const metadata = {
  title: "Returns & Exchange — ModestWear",
  description: "30-day hassle-free returns. Easy exchanges. Satisfaction guaranteed.",
};

export default function ReturnsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-serif text-stone-800 mb-8">Returns & Exchanges</h1>

      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 mb-8">
        <p className="text-rose-800 font-medium">We offer a 30-day satisfaction guarantee.</p>
        <p className="text-rose-700 text-sm mt-1">Not happy with your purchase? Return or exchange within 30 days — no questions asked.</p>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">How to Return</h2>
          <ol className="space-y-3 text-stone-600">
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-stone-800 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm">1</span>
              <span>Log into your account and navigate to Order History. Click &quot;Request Return&quot; next to the item you wish to return.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-stone-800 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm">2</span>
              <span>Print the prepaid return label that will be emailed to you. Pack the item(s) in original packaging with all tags attached.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-stone-800 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm">3</span>
              <span>Drop off at any postal location. Refunds are processed within 5-7 business days after we receive your return.</span>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Exchange Process</h2>
          <p className="text-stone-600">For exchanges, select &quot;Request Exchange&quot; in your account. Choose your preferred size or color and we&apos;ll ship the replacement at no extra cost. You&apos;ll only be charged if the exchange item has a different price.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Conditions</h2>
          <ul className="space-y-2 text-stone-600">
            <li className="flex gap-2"><span>•</span>Items must be unworn, unwashed, and have all original tags attached.</li>
            <li className="flex gap-2"><span>•</span>Items marked as &quot;final sale&quot; cannot be returned.</li>
            <li className="flex gap-2"><span>•</span>Intimate apparel (e.g., undergarments) must be in original sealed packaging.</li>
            <li className="flex gap-2"><span>•</span>Customized or personalized items are non-returnable.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Refund Timeline</h2>
          <p className="text-stone-600">Once your return is received and inspected, refunds are issued within 5-7 business days to your original payment method. You&apos;ll receive an email confirmation when the refund is processed.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Questions?</h2>
          <p className="text-stone-600">Contact our support team at <a href="mailto:returns@modestwear.com" className="text-rose-500 hover:underline">returns@modestwear.com</a> or use the chatbot for immediate assistance.</p>
        </section>
      </div>
    </div>
  )
}