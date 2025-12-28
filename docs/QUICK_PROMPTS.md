# ⚡ פרומפטים מהירים ל-Cursor AI

## Copy-Paste מהיר למשימות

---

### 🚀 התחלת הפרויקט
```
קרא את הקבצים docs/SPECIFICATION.md ו-docs/AI_GUIDELINES.md.
צור פרויקט React חדש עם Vite (JavaScript, לא TypeScript).
הגדר Tailwind CSS ו-shadcn/ui.
צור את מבנה התיקיות הבסיסי.
```

---

### 📦 הקמת Server (Express)
```
קרא את docs/AI_GUIDELINES.md.
הקם שרת ב-server/ עם Express:
- התקן express, cors, exif-parser, @hebcal/core
- צור endpoints: /api/scan, /api/sort, /api/delete, /api/create-folder, /api/exif
- הרץ ב-port 4000
```

---

### 🎨 יצירת UI
```
קרא את docs/SPECIFICATION.md (חלק UI/UX).
צור את ה-Layout הראשי עם Header, Main Area, ו-Footer.
השתמש ב-shadcn/ui ו-Tailwind.
וודא תמיכה ב-RTL ו-Dark Mode.
```

---

### 📁 רכיב בחירת תיקייה
```
צור רכיב FolderPicker.jsx:
- שדה טקסט לעריכת נתיב
- כפתור שקובע נתיב (prompt)
- Props: label, value, onSelect, onChange
השתמש ב-shadcn Card ו-Button.
```

---

### 🖼️ רכיב תצוגת תמונה
```
צור רכיב ImagePreview.jsx:
- מציג תמונה במרכז המסך
- כפתורי הבא/הקודם
- מונה תמונות (12/156)
- Loading state
Props: src, onNext, onPrevious, currentIndex, totalCount
```

---

### 🔲 גריד תמונות
```
צור רכיב ImageGrid.jsx:
- גריד של thumbnails
- הדגשה לתמונה נבחרת
- Lazy loading
- Props: images, selectedIndex, onSelect
```

---

### ⚡ כפתורי פעולות
```
צור רכיב SortingControls.jsx:
כפתורים: העבר, העתק, מחק, צור תיקייה.
כל כפתור עם אייקון ו-tooltip.
Props: onMove, onCopy, onDelete, onCreateFolder, disabled
```

---

### 🔌 API Endpoints (Express)
```
קרא docs/AI_GUIDELINES.md (חלק Backend).
צור Endpoints:
- POST /api/scan         { sourcePath }
- POST /api/sort         { src, destRoot, format, mode }
- POST /api/delete       { targetPath }
- POST /api/create-folder{ targetPath }
- POST /api/exif         { targetPath }
```

---

### 📊 State Management
```
צור Zustand store ב-src/store/appStore.js:
State: sourcePath, destPath, images, currentIndex, sortedCount, loading, error
Actions: setSourcePath, setDestPath, setImages, nextImage, prevImage, incrementSorted
```

---

### 📅 קריאת EXIF ותאריך
```
בשרת (Express):
- השתמש ב-exif-parser לקריאת תאריך
- סדר עדיפות: DateTimeOriginal > CreateDate > ModifyDate > file.birthtime
```

---

### 🕎 המרה לתאריך עברי
```
בשרת:
- התקן @hebcal/core
- פונקציה convertToHebrew(date) שמחזירה:
  { full: "כ״ד כסלו תשפ״ה", month: "כסלו", year: "תשפ״ה", folderName: "כסלו תשפה" }
```

---

### 📦 מיון אוטומטי לפי תאריך
```
צור IPC handler 'file:sort-by-date':
1. קרא EXIF מהתמונה
2. המר לתאריך עברי
3. צור תיקייה לפי תאריך עברי
4. העבר את התמונה
החזר: { success, hebrewDate, newPath }
```

---

### 🎹 קיצורי מקלדת
```
הוסף קיצורי מקלדת לאפליקציה:
- חצים ימינה/שמאלה: ניווט בין תמונות
- M: העבר תמונה
- C: העתק תמונה  
- Delete: מחק תמונה
- Escape: ביטול פעולה
```

---

### 🐛 תיקון באגים
```
האפליקציה לא [תאר את הבעיה].
קרא את הקבצים הרלוונטיים ותקן את הבאג.
אל תשנה קוד שלא קשור לבעיה.
```

---

### 📱 Build
```
הגדר electron-builder:
- צור electron-builder.json
- הגדר Windows target (nsis + portable)
- הוסף script "npm run dist"
- וודא שה-build עובר בהצלחה
```

---

## 💡 טיפים

1. **תמיד ציין לקרוא את קבצי ה-docs לפני משימה**
2. **משימה אחת בכל פעם** - לא לשלוח כמה משימות ביחד
3. **בדוק את התוצאה** לפני המשך למשימה הבאה
4. **אם יש שגיאה** - העתק אותה ובקש תיקון

