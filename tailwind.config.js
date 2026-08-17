/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    // ToastContext renders the toast stack, so its classes have to be scanned
    // too — without this they are simply never generated.
    './context/**/*.{js,jsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
