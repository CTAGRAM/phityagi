'use client';

import { Settings, Key, Brain } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [defaultProvider, setDefaultProvider] = useState('openai');

  return (
    <div className="min-h-screen px-6 py-12 lg:px-16 max-w-3xl mx-auto">
      <div className="mb-10 animate-fade-in-up">
        <h1 className="text-2xl font-semibold mb-2 flex items-center gap-3 text-white">
          <Settings className="w-6 h-6 text-neutral-400" />
          Settings
        </h1>
        <p className="text-neutral-500 text-sm">
          Configure your AI providers and preferences.
        </p>
      </div>

      <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {/* API Keys */}
        <section className="bg-black border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-medium text-white">API Keys (BYOK)</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-6">
            Bring Your Own Key — stored locally, never sent to our servers.
          </p>

          <div className="space-y-4">
            {[
              { label: 'OpenAI API Key', value: openaiKey, setter: setOpenaiKey, placeholder: 'sk-...' },
              { label: 'Anthropic API Key', value: anthropicKey, setter: setAnthropicKey, placeholder: 'sk-ant-...' },
              { label: 'Google AI API Key', value: geminiKey, setter: setGeminiKey, placeholder: 'AIza...' },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  {field.label}
                </label>
                <input
                  type="password"
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-2 rounded-md bg-black border border-neutral-800 focus:border-neutral-500 focus:outline-none text-sm text-white placeholder:text-neutral-600 font-mono transition-colors"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Default Provider */}
        <section className="bg-black border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-medium text-white">Default Engine</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {['openai', 'anthropic', 'google'].map((provider) => (
              <button
                key={provider}
                onClick={() => setDefaultProvider(provider)}
                className={`px-4 py-2 rounded text-xs transition-colors border capitalize font-medium ${
                  defaultProvider === provider
                    ? 'bg-white text-black border-white'
                    : 'bg-black text-neutral-400 border-neutral-800 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                {provider === 'google' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'Claude'}
              </button>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <section className="pt-4 pb-12">
          <button className="w-full py-4 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors">
            Save Settings
          </button>
        </section>
      </div>
    </div>
  );
}
