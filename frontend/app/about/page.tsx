import Image from 'next/image'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div>
      <section className="bg-stone-100 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-rose-500 font-medium mb-2 tracking-wide uppercase text-sm">Our Story</p>
          <h1 className="text-4xl md:text-5xl font-serif text-stone-800 leading-tight mb-6">
            Modest Fashion for the Modern Woman
          </h1>
          <p className="text-stone-600 text-lg">
            Founded in 2024, ModestWear was born from a simple belief: that modesty and style can coexist beautifully.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-stone-200">
            <Image src="/about-story.jpg" alt="Our story" fill className="object-cover" />
          </div>
          <div>
            <h2 className="text-3xl font-serif text-stone-800 mb-6">The Beginning</h2>
            <p className="text-stone-600 mb-4 leading-relaxed">
              ModestWear started when our founder, Amina Hassan, struggled to find high-quality modest clothing that 
              reflected her personal style. Frustrated by limited options that were either outdated or poorly made, 
              she decided to create a brand that would serve women like herself.
            </p>
            <p className="text-stone-600 mb-4 leading-relaxed">
              What began as a small online shop has grown into a community of women who believe that fashion 
              should be inclusive, respectful, and beautiful. Every piece in our collection is carefully curated 
              to ensure it meets our standards for quality, comfort, and style.
            </p>
            <p className="text-stone-600 leading-relaxed">
              Today, we proudly serve customers in over 30 countries, staying true to our mission of empowering 
              women through modest fashion.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-stone-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif mb-4">Our Mission</h2>
            <p className="text-stone-300 max-w-2xl mx-auto">
              To provide elegant, high-quality modest clothing that empowers women to express their faith 
              and personal style with confidence.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-white/10 rounded-xl">
              <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="font-serif text-lg mb-2">Quality First</h3>
              <p className="text-stone-300 text-sm">
                We source premium fabrics and work with skilled artisans to create garments that last.
              </p>
            </div>
            <div className="text-center p-6 bg-white/10 rounded-xl">
              <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-serif text-lg mb-2">Community Driven</h3>
              <p className="text-stone-300 text-sm">
                We listen to our customers and design collections based on your feedback and needs.
              </p>
            </div>
            <div className="text-center p-6 bg-white/10 rounded-xl">
              <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-serif text-lg mb-2">Sustainable</h3>
              <p className="text-stone-300 text-sm">
                We're committed to ethical production and reducing our environmental footprint.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif text-stone-800 mb-4">Meet Our Team</h2>
          <p className="text-stone-500">The passionate people behind ModestWear</p>
        </div>
        <div className="grid md:grid-cols-4 gap-8">
          {[
            { name: 'Amina Hassan', role: 'Founder & CEO', image: '/team/amina.jpg' },
            { name: 'Fatima Ali', role: 'Head of Design', image: '/team/fatima.jpg' },
            { name: 'Yusuf Ibrahim', role: 'Operations Manager', image: '/team/yusuf.jpg' },
            { name: 'Layla Ahmed', role: 'Customer Experience', image: '/team/layla.jpg' },
          ].map((member) => (
            <div key={member.name} className="text-center">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-200 mb-4">
                <Image src={member.image} alt={member.name} fill className="object-cover" />
              </div>
              <h3 className="font-serif text-lg text-stone-800">{member.name}</h3>
              <p className="text-stone-500 text-sm">{member.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-stone-100 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-serif text-stone-800 mb-6">Join Our Journey</h2>
          <p className="text-stone-600 mb-8">
            Subscribe to our newsletter for exclusive updates, styling tips, and early access to new collections.
          </p>
          <form className="flex max-w-md mx-auto gap-3">
            <input
              type="email"
              placeholder="Your email address"
              className="flex-1 px-4 py-3 rounded-full border border-stone-300 focus:outline-none focus:border-stone-500"
            />
            <button
              type="submit"
              className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700 transition-colors"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
