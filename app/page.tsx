export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        maxWidth: '600px',
        textAlign: 'center',
        background: 'white',
        padding: '3rem',
        borderRadius: '1rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          VerifyForge AI
        </h1>
        <p style={{
          fontSize: '1.25rem',
          color: '#666',
          marginBottom: '2rem'
        }}>
          AI-Powered Testing Platform
        </p>
        <p style={{
          color: '#888',
          marginBottom: '2rem'
        }}>
          Automated testing for websites, applications, and games using advanced AI technology.
        </p>
        <div style={{
          padding: '1rem',
          background: '#f8f9fa',
          borderRadius: '0.5rem',
          border: '2px dashed #667eea'
        }}>
          <p style={{
            color: '#667eea',
            fontWeight: '600',
            margin: 0
          }}>
            🚀 Coming Soon
          </p>
          <p style={{
            fontSize: '0.875rem',
            color: '#888',
            margin: '0.5rem 0 0 0'
          }}>
            Platform currently under development
          </p>
        </div>
      </div>
    </div>
  )
}
