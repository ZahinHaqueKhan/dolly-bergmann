'use client'
import { useState } from 'react'

export const metadata = {
  title: "Size Guide — ModestWear",
  description: "Find your perfect fit with our body measurement guide for khimar, dresses, and abaya.",
}

const SIZE_CHARTS = {
  khimar: {
    headers: ['Size', 'Head Circumference', 'Face Width', '推荐的Height'],
    rows: [
      ['S/M', '56-58 cm', '11-13 cm', '155-165 cm'],
      ['M/L', '58-60 cm', '13-15 cm', '165-172 cm'],
      ['L/XL', '60-63 cm', '15-17 cm', '172-180 cm'],
    ],
  },
  dress: {
    headers: ['Size', 'Bust', 'Waist', 'Hip', 'Length'],
    rows: [
      ['XS', '80-84 cm', '60-64 cm', '86-90 cm', '135 cm'],
      ['S', '84-88 cm', '64-68 cm', '90-94 cm', '137 cm'],
      ['M', '88-92 cm', '68-72 cm', '94-98 cm', '139 cm'],
      ['L', '92-96 cm', '72-76 cm', '98-102 cm', '141 cm'],
      ['XL', '96-102 cm', '76-82 cm', '102-108 cm', '143 cm'],
      ['2XL', '102-108 cm', '82-88 cm', '108-114 cm', '145 cm'],
    ],
  },
  abaya: {
    headers: ['Size', 'Bust', 'Length', 'Arm Hole'],
    rows: [
      ['S', '90-95 cm', '150-155 cm', '45-48 cm'],
      ['M', '95-100 cm', '155-160 cm', '48-51 cm'],
      ['L', '100-105 cm', '160-165 cm', '51-54 cm'],
      ['XL', '105-110 cm', '165-170 cm', '54-57 cm'],
      ['2XL', '110-118 cm', '170-175 cm', '57-60 cm'],
    ],
  },
}

export default function SizeGuidePage() {
  const [activeTab, setActiveTab] = useState<'dress' | 'khimar' | 'abaya'>('dress')
  const chart = SIZE_CHARTS[activeTab]

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-serif text-stone-800 mb-4 text-center">Size Guide</h1>
      <p className="text-stone-500 text-center mb-8 max-w-lg mx-auto">
        For the best fit, measure yourself while standing straight. Use a fabric measuring tape and keep it snug but not tight.
      </p>

      <div className="flex justify-center gap-3 mb-8">
        {(['dress', 'khimar', 'abaya'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-full font-medium capitalize transition-colors ${activeTab === tab ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              {chart.headers.map(h => (
                <th key={h} className="text-left py-3 px-4 text-stone-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-stone-600">
            {chart.rows.map((row, i) => (
              <tr key={i} className="border-b border-stone-100 hover:bg-stone-50">
                {row.map((cell, j) => (
                  <td key={j} className={`py-3 px-4 ${j === 0 ? 'font-medium text-stone-700' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-stone-50 rounded-xl p-6">
          <h2 className="font-serif text-lg text-stone-800 mb-3">How to Measure</h2>
          <ul className="space-y-3 text-sm text-stone-600">
            <li><strong>Bust:</strong> Measure around the fullest part of your chest, keeping the tape parallel to the floor.</li>
            <li><strong>Waist:</strong> Measure around the narrowest part of your waist.</li>
            <li><strong>Hip:</strong> Measure around the fullest part of your hips, about 20cm below your waist.</li>
            <li><strong>Length:</strong> Measure from shoulder to the desired hem length.</li>
          </ul>
        </div>
        <div className="bg-stone-50 rounded-xl p-6">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Fit Tips</h2>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>• Our khimar is designed with a relaxed, draping fit — size up for extra coverage.</li>
            <li>• Dresses have a modest cut with room for movement.</li>
            <li>• If between sizes, we recommend sizing up for the most comfortable fit.</li>
            <li>• Check the model measurements in each product description for guidance.</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-stone-500 text-sm">Still unsure? Use our chatbot or email <a href="mailto:sizing@modestwear.com" className="text-rose-500 hover:underline">sizing@modestwear.com</a> with your measurements — we&apos;ll recommend the perfect size.</p>
      </div>
    </div>
  )
}