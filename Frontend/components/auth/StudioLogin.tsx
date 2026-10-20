'use client'

import React, { FormEvent, useState } from 'react'
import { SorabaseLogo } from '@/components/ui/SorabaseLogo'

type StudioLoginProps = {
  identifier: string
  password: string
  error: string
  busy: boolean
  configured: boolean
  onIdentifierChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function StudioLogin({
  identifier,
  password,
  error,
  busy,
  configured,
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
}: StudioLoginProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <main className="sora-auth">
      <style>{`
        .sora-auth {
          --auth-ink: #20221f;
          --auth-muted: #737671;
          --auth-line: #e6e7e3;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          color: var(--auth-ink);
          background: #fff;
          font-family: inherit;
        }
        .sora-auth * { box-sizing: border-box; }
        .sora-auth__brand {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 29px 34px 28px;
          background: #f4f5f3;
        }
        .sora-auth__wordmark { display: inline-flex; align-items: center; gap: 10px; width: fit-content; }
        .sora-auth__wordmark img { display: block; width: 31px; height: 31px; object-fit: contain; }
        .sora-auth__wordmark span { font-size: 15px; line-height: 1; font-weight: 650; letter-spacing: -.035em; }
        .sora-auth__tagline {
          margin: 0;
          max-width: 380px;
          color: #444741;
          font-size: 13px;
          line-height: 1.6;
          letter-spacing: -.01em;
        }
        .sora-auth__right {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 92px 36px;
          background: #fff;
        }
        .sora-auth__form-wrap { width: min(100%, 376px); margin: 0; }
        .sora-auth__heading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          margin: 0 0 29px;
          font-size: 23px;
          line-height: 1.2;
          font-weight: 620;
          letter-spacing: -.045em;
        }
        .sora-auth__heading img { width: 27px; height: 27px; object-fit: contain; }
        .sora-auth__fields { display: grid; gap: 19px; }
        .sora-auth__label { display: grid; gap: 8px; color: #353833; font-size: 12px; font-weight: 550; }
        .sora-auth__input {
          width: 100%;
          height: 43px;
          border: 1px solid var(--auth-line);
          border-radius: 7px;
          outline: none;
          padding: 0 13px;
          background: #fff;
          color: #272925;
          font: inherit;
          font-size: 13px;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .sora-auth__input::placeholder { color: #a0a39d; }
        .sora-auth__input:focus-visible {
          border-color: #697a67;
          box-shadow: 0 0 0 3px rgba(105, 122, 103, .15);
        }
        .sora-auth__password { position: relative; }
        .sora-auth__password .sora-auth__input { padding-right: 47px; }
        .sora-auth__reveal {
          position: absolute;
          top: 50%;
          right: 8px;
          display: grid;
          width: 31px;
          height: 31px;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          border-radius: 5px;
          padding: 0;
          color: #777b75;
          background: transparent;
          cursor: pointer;
        }
        .sora-auth__reveal:hover { color: #272925; background: #f2f3f0; }
        .sora-auth__reveal:focus-visible, .sora-auth__submit:focus-visible, .sora-auth__social a:focus-visible {
          outline: 3px solid rgba(105, 122, 103, .32);
          outline-offset: 2px;
        }
        .sora-auth__reveal svg { width: 16px; height: 16px; }
        .sora-auth__setup, .sora-auth__error {
          margin: 0;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.5;
        }
        .sora-auth__setup { color: #765b20; background: #fbf5e7; border: 1px solid #eee1bf; }
        .sora-auth__error { color: #9c3535; background: #fff0ef; border: 1px solid #f1d4d1; }
        .sora-auth__submit {
          width: 100%;
          height: 43px;
          border: 1px solid var(--brand-500);
          border-radius: 7px;
          padding: 0 16px;
          color: #10251b;
          background: var(--brand-500);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 140ms ease, transform 140ms ease, opacity 140ms ease;
        }
        .sora-auth__submit:not(:disabled):hover { background: var(--brand-600); border-color: var(--brand-600); }
        .sora-auth__submit:not(:disabled):active { transform: translateY(1px); }
        .sora-auth__submit:disabled { cursor: not-allowed; opacity: .52; }
        .sora-auth__social {
          position: absolute;
          right: 36px;
          bottom: 28px;
          left: 36px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 20px;
        }
        .sora-auth__social a {
          display: grid;
          width: 23px;
          height: 23px;
          place-items: center;
          color: #737671;
          border-radius: 4px;
          transition: color 140ms ease;
        }
        .sora-auth__social a:hover { color: #20221f; }
        .sora-auth__social svg { width: 16px; height: 16px; fill: currentColor; }
        @media (max-width: 700px) {
          .sora-auth { grid-template-columns: 1fr; }
          .sora-auth__brand { min-height: auto; padding: 21px 23px; gap: 28px; }
          .sora-auth__wordmark img { width: 27px; height: 27px; }
          .sora-auth__tagline { font-size: 12px; }
          .sora-auth__right { min-height: 65vh; min-height: 65dvh; padding: 86px 23px; }
          .sora-auth__social { bottom: 24px; }
        }
      `}</style>

      <aside className="sora-auth__brand" aria-label="Sorabase">
        <div className="sora-auth__wordmark">
          <SorabaseLogo size={31} />
          <span>Sorabase</span>
        </div>
        <p className="sora-auth__tagline">The Open Source alternative to Supabase and Neon.</p>
      </aside>

      <section className="sora-auth__right" aria-label="Sign in">
        <form className="sora-auth__form-wrap" onSubmit={onSubmit}>
          <h1 className="sora-auth__heading">
            <SorabaseLogo size={27} />
            <span>Sign in</span>
          </h1>
          <div className="sora-auth__fields">
            <label className="sora-auth__label">
              Email or username
              <input
                className="sora-auth__input"
                type="text"
                name="identifier"
                autoComplete="username"
                autoFocus
                required
                maxLength={254}
                placeholder="Enter your email or username"
                value={identifier}
                onChange={event => onIdentifierChange(event.target.value)}
              />
            </label>
            <label className="sora-auth__label">
              Password
              <span className="sora-auth__password">
                <input
                  className="sora-auth__input"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  aria-label="Password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  placeholder="Enter your password"
                  value={password}
                  onChange={event => onPasswordChange(event.target.value)}
                />
                <button
                  className="sora-auth__reveal"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(value => !value)}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c5 0 8.5 4.2 9.5 6.3a1.6 1.6 0 0 1 0 1.4 13 13 0 0 1-3.2 3.9M6.2 6.2a13 13 0 0 0-3.7 5.1 1.6 1.6 0 0 0 0 1.4C3.5 14.8 7 19 12 19c1.2 0 2.3-.2 3.3-.7" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                      <circle cx="12" cy="12" r="2.7" />
                    </svg>
                  )}
                </button>
              </span>
            </label>
            {!configured && <p role="alert" className="sora-auth__setup">Admin login needs server-side setup.</p>}
            {error && <p role="alert" className="sora-auth__error">{error}</p>}
            <button className="sora-auth__submit" type="submit" disabled={busy || !configured}>
              {busy ? 'Signing in…' : 'Login'}
            </button>
          </div>
        </form>
        <nav className="sora-auth__social" aria-label="Sorabase social links">
          <a href="https://github.com/sorabase/sorabase" target="_blank" rel="noopener noreferrer" aria-label="Sorabase on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 .9a11.1 11.1 0 0 0-3.5 21.6c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.1 11.1 0 0 0 12 .9Z" />
            </svg>
          </a>
          <a href="https://x.com/sorabase_tech" target="_blank" rel="noopener noreferrer" aria-label="Sorabase on X">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.8 5.7 22H2.5l7.3-8.4L1.8 2h6.5l4.5 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" />
            </svg>
          </a>
        </nav>
      </section>
    </main>
  )
}
