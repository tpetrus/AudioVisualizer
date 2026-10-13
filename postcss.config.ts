/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: [require('autoprefixer'), require('tailwind')]
}

module.exports = config