# 🤖 הנחיות ל-AI - HebPhotoSort

## 📌 מידע כללי על הפרויקט

> כלל עבודה: כל פיצ'ר/שינוי פונקציונלי יש לעדכן גם באפיון (docs/SPECIFICATION.md) ובמידת הצורך ב-README. פיצ'רי וידאו כוללים: streaming Range, פוסטר מ-ffmpeg-static, fallback קישור פתיחה/הורדה כשניגון לא נתמך.

זהו פרויקט **אפליקציית ווב** למיון תמונות/וידאו.
- **שפה**: JavaScript (לא TypeScript)
- **פלטפורמה**: React (Frontend) + Node/Express (Backend)
- **כיוון טקסט**: RTL (עברית)

---

## 🛠️ טכנולוגיות חובה

### Frontend
```
React 18+
Vite (לא CRA)
Tailwind CSS
shadcn/ui
Radix UI (דרך shadcn)
```

### Backend
```
Node.js + Express
```

### State Management
```
Zustand (לא Redux, לא Context בלבד)
```

### נוספים
```
Lucide React (אייקונים)
clsx + tailwind-merge (class utilities)
@hebcal/core (תאריך עברי)
exif-parser (קריאת EXIF מתמונות)
ffmpeg-static (חילוץ פריימים לוידאו לטובת פוסטר/HASH)
mime-types (קביעת Content-Type לקבצי מדיה + Range)
cors (API)
```

---

## ❌ טכנולוגיות לא להשתמש

```
- TypeScript (הפרויקט ב-JavaScript)
- Redux / MobX
- CSS Modules / Styled Components
- Next.js / Remix
- Create React App
- Material UI / Chakra UI / Ant Design
- jQuery
```

---

## 📁 מבנה קבצים

```
שמות קבצים: camelCase לקבצי JS, PascalCase לcomponents
תיקיות: lowercase עם מקפים אם צריך
```

### דוגמה:
```
✅ src/components/FolderPicker.jsx
✅ src/hooks/useApi.js
✅ src/lib/utils.js
✅ server/src/index.js

❌ src/components/folder-picker.jsx
❌ src/Components/FolderPicker.jsx
```

---

## 🎨 סגנון קוד

### React Components
```jsx
// ✅ נכון - Function component עם arrow function
const MyComponent = ({ prop1, prop2 }) => {
  return (
    <div>...</div>
  );
};

export default MyComponent;

// ❌ לא - Class components
class MyComponent extends React.Component { }
```

### Imports
```jsx
// ✅ סדר imports נכון
import { useState, useEffect } from 'react';           // React
import { Button } from '@/components/ui/button';       // UI
import { useAppStore } from '@/store/appStore';        // Store
import { cn } from '@/lib/utils';                      // Utils
import './styles.css';                                  // Styles
```

### Tailwind
```jsx
// ✅ השתמש ב-cn() לשילוב classes
<div className={cn(
  "flex items-center gap-2",
  "bg-background text-foreground",
  isActive && "border-primary"
)}>

// ✅ RTL classes
<div className="rtl:space-x-reverse">
```

---

## 🔌 Backend API (Express)

### Endpoints
```http
POST /api/scan            { sourcePath }
POST /api/sort            { src, destRoot, format, mode }
POST /api/delete          { targetPath }
POST /api/create-folder   { targetPath }
POST /api/exif            { targetPath }
GET  /api/health
```

### קווים מנחים
- החזר always JSON: { success?, error? }
- סנן קבצי תמונה בשרת (jpg/jpeg/png/gif/webp/bmp)
- טיפול בשגיאות: try/catch והחזר status 400/500 עם error ברור
- שמור על נתיבי קלט כפי שהמשתמש סיפק (Windows paths), השתמש `path.join`/`path.parse`

---

## 🌍 תמיכה בעברית (RTL)

### Tailwind Config
```javascript
// tailwind.config.js
module.exports = {
  // ...
  plugins: [
    require('tailwindcss-rtl'),  // אם צריך
  ],
}
```

### HTML
```html
<html lang="he" dir="rtl">
```

### CSS
```css
/* index.css */
@layer base {
  html {
    direction: rtl;
  }
}
```

### Components
```jsx
// השתמש ב-start/end במקום left/right
<div className="ps-4 pe-2">  {/* padding-start, padding-end */}
<div className="ms-auto">    {/* margin-start */}
```

---

## 🎯 shadcn/ui Setup

### התקנה
```bash
npx shadcn@latest init
```

### הגדרות מומלצות
```json
{
  "style": "default",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### Components להתקין
```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add progress
npx shadcn@latest add toast
npx shadcn@latest add tooltip
npx shadcn@latest add scroll-area
```

---

## 📝 קונבנציות נוספות

### Error Handling
```javascript
// ✅ תמיד טפל בשגיאות
try {
  const result = await window.electronAPI.moveFile(src, dest);
} catch (error) {
  console.error('Failed to move file:', error);
  // הצג הודעה למשתמש
}
```

### Comments
```javascript
// ✅ הערות בעברית או אנגלית - עקביות
// פונקציה להעברת קובץ
// OR
// Function to move a file
```

### Naming
```javascript
// Variables & Functions: camelCase
const selectedImage = ...
const handleImageClick = () => ...

// Components: PascalCase
const ImagePreview = () => ...

// Constants: UPPER_SNAKE_CASE
const MAX_IMAGE_SIZE = 5000000;
const SUPPORTED_FORMATS = ['jpg', 'png', 'gif'];
```

---

## ⚡ ביצועים

### Image Loading
```javascript
// ✅ השתמש ב-lazy loading
<img loading="lazy" src={imagePath} />

// ✅ צור thumbnails בגודל קטן
// ✅ השתמש ב-intersection observer לגריד
```

### Memory
```javascript
// ✅ נקה URL objects
useEffect(() => {
  return () => {
    URL.revokeObjectURL(imageUrl);
  };
}, [imageUrl]);
```

---

## 🧪 בדיקות

לא נדרשות בדיקות אוטומטיות בשלב זה.
בדיקות ידניות בלבד לפי הרשימה ב-TASKS.md.

---

## 📦 Build

### Development
```bash
npm run dev              # React בלבד
npm run electron:dev     # React + Electron
```

### Production
```bash
npm run build           # Build React
npm run dist            # Build + Create Installer
```

---

## 🚫 דברים להימנע מהם

1. **Over-engineering** - אל תוסיף פיצ'רים שלא נדרשו
2. **Premature optimization** - קודם שזה יעבוד, אחר כך נשפר
3. **Complex state** - שמור על state פשוט ושטוח
4. **Deep nesting** - מקסימום 3 רמות של components
5. **God components** - פצל components גדולים
6. **Magic numbers** - השתמש בקבועים עם שמות ברורים

---

## ✅ Checklist לפני כל commit

- [ ] אין שגיאות בקונסול
- [ ] האפליקציה רצה ב-dev mode
- [ ] RTL עובד כמו שצריך
- [ ] אין console.log מיותרים
- [ ] קוד מפורמט (Prettier)

