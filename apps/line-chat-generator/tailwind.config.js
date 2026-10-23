/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        line: {
          green: '#06C755',
          darkGreen: '#0B6F3A',
          senderLight: '#9CEB68',
          senderDark: '#28743D',
          receiverLight: '#FDFDFC',
          receiverDark: '#24333C',
          bgLight: '#8CABD9', // classic LINE blue/gray
          bgLineDefault: '#F3F4F6',
          bgDark: '#15242E',
          headerDark: '#0B6F3A',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans TC"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
