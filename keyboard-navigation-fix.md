# Keyboard & Bottom Navigation UX Fix

## Problem

Saat virtual keyboard muncul di perangkat mobile (Android maupun iOS), Bottom Navigation ("Buku Kas" dan "Asisten AI") ikut terdorong ke atas bersama viewport.

Akibatnya:

- Bottom navigation menutupi sebagian konten.
- Layout terlihat kurang natural.
- Pengalaman mengetik terasa kurang nyaman.
- Tidak mengikuti pola UX aplikasi chat modern.

Saat keyboard aktif, pengguna tidak membutuhkan Bottom Navigation karena fokus berada pada proses input.

---

## Expected Behaviour

Ketika keyboard muncul:

- Bottom Navigation tidak ikut naik ke atas keyboard.
- Bottom Navigation menghilang (hide) dengan animasi singkat ATAU tetap berada di luar viewport.
- Input area tetap naik mengikuti keyboard.
- Chat/list tetap dapat discroll.
- Tidak ada blank space.
- Tidak ada layout jump.
- Tidak ada flicker.

Ketika keyboard ditutup:

- Bottom Navigation muncul kembali secara otomatis.
- Posisi kembali fixed di bawah.
- Animasi halus (±200ms).

---

## Implementation Requirements

Gunakan visualViewport API yang sudah ada sebagai sumber kebenaran keyboard detection.

Jangan menggunakan resize biasa sebagai indikator utama.

Pisahkan state:

- keyboardOpen
- bottomNavVisible

Bottom Navigation harus memiliki state sendiri dan tidak bergantung pada perubahan viewport.

Contoh flow:

Keyboard Open
↓

keyboardOpen = true

↓

Bottom Navigation:
display: none
atau
opacity:0
translateY(100%)

↓

Input Bar:
translate mengikuti keyboard

↓

Keyboard Close

↓

Bottom Navigation muncul kembali

---

## Layout Requirements

Bottom Navigation:

- position: fixed
- left: 0
- right: 0
- bottom: env(safe-area-inset-bottom)
- z-index tetap
- tidak ikut translate akibat keyboard

Input Area:

- tetap mengikuti keyboard
- tetap berada tepat di atas keyboard
- safe-area tetap dihitung

Content:

- tetap dapat discroll
- tidak tertutup keyboard
- tidak berubah tinggi secara tiba-tiba

---

## Animation

Bottom Navigation

Hide:
- opacity
- translateY(100%)

Show:
- opacity
- translateY(0)

Durasi:

150–200ms

Gunakan CSS transition.

---

## Do Not

Jangan:

- memindahkan Bottom Navigation ke atas keyboard
- mengubah posisi fixed menjadi absolute
- menyebabkan layout shift
- menyebabkan white gap
- menyebabkan scroll jump

---

## Acceptance Criteria

Android Chrome

- keyboard muncul
- Bottom Navigation menghilang
- Input mengikuti keyboard
- Tidak ada overlap

Android PWA

- perilaku sama

iOS Safari

- perilaku sama

iOS PWA

- perilaku sama

Desktop

- tidak ada perubahan

Landscape

- tetap stabil

---

## Expected UX

Saat pengguna mengetik:

Keyboard muncul

↓

Bottom Navigation menghilang

↓

Input berada tepat di atas keyboard

↓

Chat tetap terlihat

↓

Keyboard ditutup

↓

Bottom Navigation muncul kembali

Perilaku ini harus menyerupai UX aplikasi modern seperti:

- WhatsApp
- Telegram
- Instagram DM
- Messenger
- ChatGPT Mobile

dan memberikan pengalaman yang natural tanpa layout jump.