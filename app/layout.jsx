import './portal.css';

export const metadata = {
  title: 'Mossvale · Private game',
  description: 'Private access to the Mossvale browser game.',
  robots: {index: false, follow: false},
};

export default function RootLayout({children}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
