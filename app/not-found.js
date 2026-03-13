import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <p className="text-7xl font-light text-gray-200 mb-4 select-none">404</p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">Page not found</h1>
      <p className="text-gray-500 text-sm mb-6">
        This page doesn&apos;t exist, has been removed, or is private.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        Go home
      </Link>
    </div>
  );
}
