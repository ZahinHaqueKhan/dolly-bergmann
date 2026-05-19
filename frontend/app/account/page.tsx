'use client'
import { useState } from 'react'
import Link from 'next/link'
export const dynamic = 'force-dynamic'

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="flex mb-8 border-b border-stone-200">
          <button onClick={() => setActiveTab('login')} className={`flex-1 pb-4 text-center font-medium border-b-2 ${activeTab === 'login' ? 'border-stone-800 text-stone-800' : 'border-transparent text-stone-500'}`}>
            Sign In
          </button>
          <button onClick={() => setActiveTab('register')} className={`flex-1 pb-4 text-center font-medium border-b-2 ${activeTab === 'register' ? 'border-stone-800 text-stone-800' : 'border-transparent text-stone-500'}`}>
            Create Account
          </button>
        </div>

        {activeTab === 'login' && (
          <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-4">
            <input type="email" placeholder="Email" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <input type="password" placeholder="Password" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <button type="submit" className="w-full bg-stone-800 text-white py-3 rounded-full font-medium hover:bg-stone-700">Sign In</button>
            <p className="text-center text-sm text-stone-500">Forgot your password? <a href="#" className="text-rose-500 hover:underline">Reset it</a></p>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-4">
            <input type="text" placeholder="First Name" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <input type="text" placeholder="Last Name" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <input type="email" placeholder="Email" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <input type="password" placeholder="Password" className="w-full border border-stone-200 rounded-lg px-4 py-3 focus:outline-none focus:border-stone-400" />
            <button type="submit" className="w-full bg-stone-800 text-white py-3 rounded-full font-medium hover:bg-stone-700">Create Account</button>
            <p className="text-center text-xs text-stone-400">By creating an account, you agree to our privacy policy and terms.</p>
          </form>
        )}

        <div className="my-8 flex items-center gap-4">
          <div className="flex-1 h-px bg-stone-200" />
          <p className="text-xs text-stone-400">or continue with</p>
          <div className="flex-1 h-px bg-stone-200" />
        </div>

        <button className="w-full border border-stone-200 py-3 rounded-full font-medium text-stone-700 hover:bg-stone-50 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 100-12.064 6.033 6.033 0 005.445 3.972z"/></svg>
          Continue with Google
        </button>
      </div>

      <div className="mt-16 max-w-md mx-auto">
        <h2 className="text-xl font-serif text-stone-800 mb-6">Guest Checkout</h2>
        <p className="text-stone-500 text-sm mb-4">Prefer to check out as a guest? Simply add items to your cart and proceed to checkout — no account required.</p>
        <Link href="/checkout" className="inline-block bg-stone-100 text-stone-700 px-6 py-3 rounded-full font-medium hover:bg-stone-200">
          Checkout as Guest
        </Link>
      </div>
    </div>
  )
}