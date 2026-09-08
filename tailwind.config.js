/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    // ToastContext renders the toast stack, so its classes have to be scanned
    // too — without this they are simply never generated.
    './context/**/*.{js,jsx}',
    // postGrid.js holds grid-cols-* strings used via className interpolation;
    // without scanning lib those densities (esp. 5–8) compile to nothing and
    // the page grid collapses to a single column.
    './lib/**/*.{js,jsx}',
  ],
  // Keep the density map honest even if a future refactor moves the strings.
  safelist: [
    'grid-cols-1',
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-5',
    'grid-cols-6',
    'grid-cols-7',
    'grid-cols-8',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
