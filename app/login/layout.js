export default function LoginLayout({ children }) {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/background-800.webp"
        type="image/webp"
        media="(max-width: 767px)"
      />
      <link
        rel="preload"
        as="image"
        href="/background-1920.webp"
        type="image/webp"
        media="(min-width: 768px)"
      />
      {children}
    </>
  );
}
