// Local preview fallback: Next's webpack dev mode needs Tailwind's PostCSS plugin.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
