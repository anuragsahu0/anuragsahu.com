import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { ThemeProvider, useThemeContext } from '@/context/ThemeContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Navbar } from '@/components/layout/Navbar';
import { BackgroundCanvas } from '@/components/layout/BackgroundCanvas';
import { CommandPaletteModal } from '@/components/modals/CommandPaletteModal';
import { SITE_CONFIG } from '@/constants/config';

/**
 * RootLayout Shell
 * Encapsulates BackgroundCanvas, Navbar, CommandPaletteModal (Ctrl+K), ThemeProvider, and ErrorBoundary.
 */
export const RootLayoutContent = () => {
  const [isRecruiterMode, setIsRecruiterMode] = useState(false);
  const [isCLIOpen, setIsCLIOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const { toggleTheme } = useThemeContext();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCLIOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleRecruiterMode = () => {
    setIsRecruiterMode((prev) => !prev);
    showToast(isRecruiterMode ? '⚡ EXITED 30S RECRUITER MODE' : '⚡ ACTIVATED 30S RECRUITER MODE');
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(SITE_CONFIG.email);
    showToast(`✓ COPIED EMAIL: ${SITE_CONFIG.email}`);
  };

  return (
    <div className="min-h-screen bg-space-black text-starlight flex flex-col font-body selection:bg-nebula-cyan selection:text-space-black relative overflow-x-hidden">
      {/* Background Physics Field */}
      <BackgroundCanvas />

      {/* Floating Glass Navbar */}
      <Navbar
        onToggleRecruiterMode={handleToggleRecruiterMode}
        isRecruiterMode={isRecruiterMode}
        onOpenCLI={() => setIsCLIOpen(true)}
      />

      {/* Main Route Content */}
      <main className="flex-1">
        <ErrorBoundary>
          <Outlet context={{ isRecruiterMode, onCopyEmail: handleCopyEmail }} />
        </ErrorBoundary>
      </main>

      {/* Command Palette CLI Modal Overlay (Ctrl + K) */}
      <CommandPaletteModal
        isOpen={isCLIOpen}
        onClose={() => setIsCLIOpen(false)}
        onCopyEmail={handleCopyEmail}
        onToggleTheme={toggleTheme}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 glass-panel px-5 py-3 rounded-lg border border-nebula-cyan text-xs font-mono text-starlight shadow-cyanGlow animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Global Telemetry Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs font-mono text-dim flex flex-col sm:flex-row items-center justify-between max-w-6xl mx-auto px-4 gap-2">
        <span>&copy; 2026 {SITE_CONFIG.name}. Built with Full-Stack Engineering &amp; Modern Interactive WebGL.</span>
        <a href={`mailto:${SITE_CONFIG.email}`} className="text-nebula-cyan hover:underline font-semibold">
          {SITE_CONFIG.email}
        </a>
      </footer>
    </div>
  );
};

export const RootLayout = () => (
  <ThemeProvider>
    <RootLayoutContent />
  </ThemeProvider>
);
