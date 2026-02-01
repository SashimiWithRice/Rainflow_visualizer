# Rainflow Learning UI

Rainflow counting（レインフロー法）を **学習目的で可視化**するための、ブラウザ上で動くインタラクティブUIです。  
入力波形・turning points・スタック・確定サイクルの増分表示に加え、グラフィック面では「雨粒演出」を2モードで切り替えられます。

- **Cinematic Rain**（見た目優先）：確定サイクルのB/C点から雨粒を断続生成（パーティクル落下＋伸び＋ハイライト＋スプラッシュ）
- **Pagoda Roof (approx)**（学習優先の近似）：turning points を回転座標に投影し、縦落下→交差点停止を可視化（近似）

> 注意：本実装のrainflowアルゴリズムは「学習・デモ向けの簡易実装」です。  
> ASTM E1049 等の厳密仕様に完全一致することを保証するものではありません。

---

## Features

### Analysis
- 入力波形（おしゃれプロット：背景/グロー/面塗り/ガラス点）
- Turning points 抽出
- 4-point stack 法（学習向けのイベントログ）
- ステップ再生（Play/Step/Back）
- **Cycle table**（増分）
- **Matrix**（range × mean の簡易ヒートマップ：おまけ）

### Graphics tab
- Rain enable/disable
- Rain mode 切替（Cinematic / Pagoda）
- 粒数・頻度・重力・初速・サイズ・ストレッチ・残像など調整
- Plot theme（clean/neon/ink）と grid/area/smooth/glow 調整

---

## Tech Stack

- Vite + React + TypeScript
- D3 (SVG plot)
- Canvas (rain particles overlay)
- GitHub Actions → GitHub Pages デプロイ

---

## Getting Started

### 1) Install
```bash
npm install
