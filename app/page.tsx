'use client';

import { CheckCircle2, Zap, Shield, TrendingUp, Smartphone, FileCode, Gamepad2, Globe, Bot, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const testTypes = [
    {
      icon: <Globe className="w-8 h-8" />,
      title: "Website Testing",
      description: "Complete website validation including links, forms, responsiveness, and SEO",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: <Smartphone className="w-8 h-8" />,
      title: "Mobile App Testing",
      description: "iOS & Android testing with real device emulation and gesture support",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: <Gamepad2 className="w-8 h-8" />,
      title: "Game Testing",
      description: "Performance, gameplay mechanics, and multiplayer functionality testing",
      color: "from-orange-500 to-red-500"
    },
    {
      icon: <FileCode className="w-8 h-8" />,
      title: "API Testing",
      description: "Endpoint validation, response time, and security vulnerability scanning",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Security Testing",
      description: "OWASP Top 10 vulnerabilities, penetration testing, and compliance checks",
      color: "from-red-500 to-rose-500"
    },
    {
      icon: <Bot className="w-8 h-8" />,
      title: "AI-Powered Analysis",
      description: "Intelligent bug detection and automatic fix suggestions with Javari AI",
      color: "from-violet-500 to-purple-500"
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: "Performance Testing",
      description: "Load testing, stress testing, and optimization recommendations",
      color: "from-yellow-500 to-orange-500"
    },
    {
      icon: <CheckCircle2 className="w-8 h-8" />,
      title: "Accessibility Testing",
      description: "WCAG 2.2 AA compliance and screen reader compatibility",
      color: "from-teal-500 to-cyan-500"
    }
  ];

  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Get results in minutes, not hours"
    },
    {
      icon: <Bot className="w-6 h-6" />,
      title: "AI-Powered Fixes",
      description: "90%+ confidence automatic bug fixing"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Enterprise Security",
      description: "SOC 2 compliant infrastructure"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">⚡</div>
              <div>
                <h1 className="text-2xl font-bold text-white">VerifyForge AI</h1>
                <p className="text-sm text-purple-300">AI-Powered Testing Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard" 
                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-purple-500/50"
              >
                Start Testing
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 rounded-full text-purple-300 text-sm font-semibold mb-8 border border-purple-500/30">
            <Zap className="w-4 h-4" />
            Powered by Javari AI
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Revolutionary
            <span className="block bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI-Powered Testing
            </span>
          </h1>
          
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Test websites, mobile apps, and games with enterprise-grade AI. Get intelligent bug detection, 
            automatic fixes, and comprehensive reports in minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/dashboard" 
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-2xl hover:shadow-purple-500/50"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="px-8 py-4 bg-white/10 text-white rounded-lg font-bold text-lg hover:bg-white/20 transition-all backdrop-blur-sm border border-white/20">
              View Demo
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto">
            {features.map((feature, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                <div className="text-purple-400 mb-3">{feature.icon}</div>
                <h3 className="text-white font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Test Types Grid */}
      <section className="py-20 px-4 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              8 Powerful Testing Engines
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Comprehensive testing suite covering every aspect of your digital products
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {testTypes.map((test, index) => (
              <div 
                key={index}
                className="group bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-purple-500/50 transition-all hover:bg-white/10 cursor-pointer"
              >
                <div className={`w-16 h-16 rounded-lg bg-gradient-to-br ${test.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                  {test.icon}
                </div>
                <h3 className="text-white font-bold text-xl mb-2">{test.title}</h3>
                <p className="text-gray-400 text-sm">{test.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-300">Three simple steps to complete testing</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-white font-bold text-2xl mb-3">Submit Your Project</h3>
              <p className="text-gray-400">Enter your URL, upload your app, or connect your game</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-white font-bold text-2xl mb-3">AI Runs Tests</h3>
              <p className="text-gray-400">Javari AI executes comprehensive testing across all selected engines</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-white font-bold text-2xl mb-3">Get Results & Fixes</h3>
              <p className="text-gray-400">Receive detailed reports with automatic fix suggestions</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-purple-900 to-pink-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Revolutionize Your Testing?
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Join hundreds of companies using VerifyForge AI for automated testing
          </p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-900 rounded-lg font-bold text-lg hover:bg-gray-100 transition-all shadow-2xl"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-purple-200 text-sm mt-4">3 free tests • No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black/40 border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2025 CR AudioViz AI, LLC • VerifyForge AI • "Testing Revolution" 🚀
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Powered by Javari AI • Fortune 50 Quality Standards
          </p>
        </div>
      </footer>
    </div>
  );
}
