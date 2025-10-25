export const metadata = {
  title: 'VerifyForge AI - AI-Powered Testing Platform',
  description: 'AI-powered testing platform for websites, apps, and games'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
