export const metadata = {
  title: "Shipping Info — ModestWear",
  description: "Free shipping on orders over $100. Fast delivery within 3-5 business days. International shipping available.",
};

export default function ShippingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-serif text-stone-800 mb-8">Shipping Information</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Free Shipping</h2>
          <p className="text-stone-600">Enjoy free standard shipping on all orders over $100. No code required — free shipping is automatically applied at checkout.</p>
        </section>

        <div className="bg-stone-50 rounded-xl p-6">
          <h2 className="text-xl font-serif text-stone-800 mb-4">Delivery Times</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left py-3 text-stone-500 font-medium">Method</th>
                <th className="text-left py-3 text-stone-500 font-medium">Duration</th>
                <th className="text-left py-3 text-stone-500 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="text-stone-600">
              {[
                { method: "Standard", duration: "5-7 business days", cost: "Free over $100 / $7.99 below" },
                { method: "Express", duration: "2-3 business days", cost: "$14.99" },
                { method: "Overnight", duration: "1 business day", cost: "$29.99" },
                { method: "International", duration: "10-21 business days", cost: "$24.99" },
              ].map(row => (
                <tr key={row.method} className="border-b border-stone-100">
                  <td className="py-3 font-medium text-stone-700">{row.method}</td>
                  <td className="py-3">{row.duration}</td>
                  <td className="py-3">{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Processing Time</h2>
          <p className="text-stone-600">Orders are processed within 1-2 business days. Orders placed on Friday after 2 PM EST will be processed the following Monday.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">Tracking Your Order</h2>
          <p className="text-stone-600">Once your order ships, you&apos;ll receive a confirmation email with a tracking number. You can also track your order status in your account dashboard.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif text-stone-800 mb-3">International Shipping</h2>
          <p className="text-stone-600">We ship to over 50 countries worldwide. Duties and taxes are the responsibility of the recipient. International orders may be subject to customs clearance delays.</p>
        </section>
      </div>
    </div>
  )
}