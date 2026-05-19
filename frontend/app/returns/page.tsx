import Link from 'next/link'

export default function ReturnsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-serif text-stone-800 mb-8">Returns & Exchanges</h1>
      
      <div className="prose prose-stone max-w-none">
        <p className="text-lg text-stone-600 mb-8">
          We want you to love your purchase. If you're not completely satisfied, we offer a hassle-free 
          30-day return policy.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Return Policy</h2>
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-6 mb-6">
            <h3 className="font-medium text-stone-800 mb-2">30-Day Guarantee</h3>
            <p className="text-stone-600">
              You have 30 days from the date of delivery to return any unused, unworn items with original 
              tags attached for a full refund.
            </p>
          </div>
          
          <h3 className="text-xl font-serif text-stone-800 mb-3">Eligible Items</h3>
          <ul className="list-disc pl-6 space-y-2 text-stone-600 mb-6">
            <li>Items must be in original condition - unworn, unwashed, and undamaged</li>
            <li>Original tags must be attached</li>
            <li>Items must be in original packaging</li>
            <li>Proof of purchase (order number) required</li>
          </ul>

          <h3 className="text-xl font-serif text-stone-800 mb-3">Non-Returnable Items</h3>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Items without original tags</li>
            <li>Worn, washed, or altered items</li>
            <li>Items purchased from third-party retailers</li>
            <li>Final sale or clearance items (unless defective)</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">How to Return</h2>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-stone-800 text-white rounded-full flex items-center justify-center font-medium">
                1
              </div>
              <div>
                <h3 className="font-medium text-stone-800 mb-2">Start Your Return</h3>
                <p className="text-stone-600">
                  Log into your account and go to Order History. Select the order containing the item(s) 
                  you want to return and click "Start Return."
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-stone-800 text-white rounded-full flex items-center justify-center font-medium">
                2
              </div>
              <div>
                <h3 className="font-medium text-stone-800 mb-2">Print Your Label</h3>
                <p className="text-stone-600">
                  Once your return is approved, you'll receive a prepaid return shipping label via email. 
                  Print it and attach it to your package.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-stone-800 text-white rounded-full flex items-center justify-center font-medium">
                3
              </div>
              <div>
                <h3 className="font-medium text-stone-800 mb-2">Ship It Back</h3>
                <p className="text-stone-600">
                  Drop off your package at any authorized shipping location. Keep the tracking number 
                  for your records.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Exchanges</h2>
          <p className="text-stone-600 mb-4">
            We currently do not offer direct exchanges. To exchange an item, please return the original 
            item for a refund and place a new order for the desired size or color.
          </p>
          <p className="text-stone-600">
            This ensures you receive your replacement item as quickly as possible.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Refunds</h2>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Refunds are processed within 5-7 business days of receiving your return</li>
            <li>Refunds are issued to the original payment method</li>
            <li>Original shipping costs are non-refundable (unless the return is due to our error)</li>
            <li>You will receive an email confirmation once your refund has been processed</li>
            <li>Please allow 3-5 additional business days for the refund to appear in your account</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">International Returns</h2>
          <p className="text-stone-600 mb-4">
            For international returns, customers are responsible for return shipping costs and any 
            applicable customs fees. We recommend using a trackable shipping service.
          </p>
          <p className="text-stone-600">
            Once we receive and inspect your return, we will issue the refund for the item(s) only 
            (original shipping and return shipping costs are non-refundable).
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Damaged or Defective Items</h2>
          <p className="text-stone-600 mb-4">
            If you receive a damaged or defective item, please contact us within 7 days of delivery at{' '}
            <a href="mailto:support@modestwear.com" className="text-rose-500 hover:underline">support@modestwear.com</a>.
          </p>
          <p className="text-stone-600">
            Please include photos of the damage and your order number. We will send a replacement or 
            issue a full refund, including shipping costs.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-serif text-stone-800 mb-4">Questions?</h2>
          <p className="text-stone-600">
            Need help with a return? Our customer service team is here to help. Contact us at{' '}
            <a href="mailto:support@modestwear.com" className="text-rose-500 hover:underline">support@modestwear.com</a>{' '}
            or visit our <Link href="/account" className="text-rose-500 hover:underline">Help Center</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
