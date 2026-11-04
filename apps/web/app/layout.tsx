// The site shell. Deliberately plain: the beauty pass is M6 (constitution VI); UI comments wait in
// design/ui-notes.md.
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Petal',
  description: 'See who holds power in a network, drawn as a flower. NEAR first.',
};

// .legend: the renderer sets its colour variables on the svg only (core's render/style.ts, light
// theme), and the legend's swatches name those variables from outside it.
const CSS = `
body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#222}
nav a{margin-right:1rem}
code{font-size:.9em;word-break:break-all}
.muted{color:#666}
.error{color:#b00020}
.box{border:1px solid #ccc;padding:.5rem 1rem;margin:1rem 0}
.badge{display:inline-block;border:1px solid #888;padding:0 .4rem;margin-left:.4rem;font-size:.8em}
.flower-svg{max-width:640px}
.gallery-flower{width:320px;max-width:100%;height:auto}
.flower-svg svg{width:100%;height:auto}
.flower-svg [data-p]{cursor:pointer}
.petal-selected{stroke:#000!important;stroke-width:2!important}
.swatch{display:inline-block;width:.9em;height:.9em;border:1px solid #888;vertical-align:middle}
:root{--k-staking_pool:#6b8f71;--k-staking_entity:#c9a227;--seg-other:#9bb7a0;--seg-large:#557a5c;--seg-liquid:#c9a227;--seg-lockup:#7a6a9b}
.legend{--ink-2:#52514e;--unknown:#c9c7bf;--tail:#b8b6ae;--k-pool:#2a78d6;--k-exchange:#eb6834;--k-entity:#1baf7a;--k-custodian:#eda100;--k-contract:#e87ba4;--k-treasury:#008300;--k-org:#4a3aa7;--k-delegator:#e34948}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.2rem .5rem;text-align:left}
ol.events li{margin:.2rem 0;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere}
textarea{width:100%;font:inherit}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{CSS}</style>
      </head>
      <body>
        <nav>
          <a href="/">
            <strong>Petal</strong>
          </a>
          <a href="/">Gallery</a>
          <a href="/make">Make a flower</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
