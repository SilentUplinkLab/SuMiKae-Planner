# SuMiKae-Planner

マンションや部屋の家具配置を、見下ろし画面で直感的に試せるブラウザアプリです。

## Features

- 部屋サイズを mm 単位で設定
- ドア、コンセント、TV 線、窓を壁に沿って配置
- 家具ライブラリを登録して部屋へ追加
- 家具と設備をドラッグして配置
- 設備の壁面スナップと回転
- 家具のドラッグ中に `R` キーで 90 度回転
- 壁をクリックして家具の位置範囲、高さ、壁からの距離を確認
- アンドゥ対応
- グリッド表示オンオフ、文字サイズ変更、ズーム対応

## Demo

GitHub Pages を有効化すると、次の URL で公開できます。

`https://silentuplinklab.github.io/SuMiKae-Planner/`

## Local Usage

リポジトリを開いて次を実行します。

```bash
cd /home/devlinux/ai-workspaces/codex/project04
python3 -m http.server 8000
```

その後、ブラウザで以下を開きます。

`http://localhost:8000`

## Tech Stack

- HTML
- CSS
- JavaScript
- LocalStorage

## Project Structure

- `index.html`: 画面 UI
- `styles.css`: レイアウトと見た目
- `app.js`: 状態管理、描画、ドラッグ処理

## Notes

- 横画面での利用を前提にしています
- 保存データはブラウザの LocalStorage に保存されます
