import Link from 'next/link'

export default function ShippingPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-serif text-stone-800 mb-8">Shipping Information</h1>
      
      <div className="prose prose-stone max-w-none">
        <p className="text-lg text-stone-600 mb-8">
          We offer fast and reliable shipping worldwide. All orders are carefully packaged and shipped 
          within 1-2 business days.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Shipping Zones & Rates</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-3 px-4 font-medium text-stone-700">Zone</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-700">Countries</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-700">Standard Shipping</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-700">Express Shipping</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="py-3 px-4 text-stone-600">Domestic</td>
                  <td className="py-3 px-4 text-stone-600">United States</td>
                  <td className="py-3 px-4 text-stone-600">$5.99 (5-7 days)</td>
                  <td className="py-3 px-4 text-stone-600">$14.99 (2-3 days)</td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="py-3 px-4 text-stone-600">Europe</td>
                  <td className="py-3 px-4 text-stone-600">UK, EU countries</td>
                  <td className="py-3 px-4 text-stone-600">$9.99 (7-14 days)</td>
                  <td className="py-3 px-4 text-stone-600">$24.99 (3-5 days)</td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="py-3 px-4 text-stone-600">Middle East</td>
                  <td className="py-3 px-4 text-stone-600">UAE, Saudi Arabia, Qatar, etc.</td>
                  <td className="py-3 px-4 text-stone-600">$12.99 (7-14 days)</td>
                  <td className="py-3 px-4 text-stone-600">$29.99 (3-5 days)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-600">Rest of World</td>
                  <td className="py-3 px-4 text-stone-600">All other countries</td>
                  <td className="py-3 px-4 text-stone-600">$14.99 (10-21 days)</td>
                  <td className="py-3 px-4 text-stone-600">$34.99 (5-7 days)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Free Shipping</h2>
          <div className="bg-stone-100 rounded-xl p-6">
            <p className="text-stone-700">
              <strong>Free standard shipping</strong> on all orders over <strong>$100</strong> to any destination worldwide.
              Discount automatically applied at checkout.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Processing Time</h2>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Orders are processed within 1-2 business days</li>
            <li>Orders placed on weekends or holidays will be processed the next business day</li>
            <li>During sale periods, processing may take an additional 1-2 days</li>
            <li>You will receive a shipping confirmation email with tracking information once your order ships</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Tracking Your Order</h2>
          <p className="text-stone-600 mb-4">
            Once your order has shipped, you will receive an email with a tracking number. You can use this 
            number to track your package on the carrier's website.
          </p>
          <p className="text-stone-600">
            If you haven't received your tracking information within 3 business days of placing your order, 
            please contact us at <a href="mailto:support@modestwear.com" className="text-rose-500 hover:underline">support@modestwear.com</a>
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Customs & Duties</h2>
          <p className="text-stone-600 mb-4">
            International orders may be subject to customs fees, import duties, and taxes imposed by the 
            destination country. These charges are the responsibility of the customer and are not included 
            in the shipping cost.
          </p>
          <p className="text-stone-600">
            Please check with your local customs office for information on potential fees before placing an order.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Shipping Issues</h2>
          <p className="text-stone-600 mb-4">
            If your package is lost, stolen, or damaged in transit, please contact us within 7 days of the 
            estimated delivery date. We will work with the carrier to resolve the issue.
          </p>
          <p className="text-stone-600">
            For damaged items, please provide photos of the damage when contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Need Help?</h2>
          <p className="text-stone-600">
            Have questions about shipping? Contact our customer service team at{' '}
            <a href="mailto:support@modestwear.com" className="text-rose-500 hover:underline">support@modestwear.com</a>{' '}
            or through our <Link href="/account" className="text-rose-500 hover:underline">contact form</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
