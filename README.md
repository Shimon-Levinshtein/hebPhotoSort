# 📸 HebPhotoSort

> אפליקציית React + Node למיון תמונות לפי תאריך עברי

## 🎯 מה זה?

HebPhotoSort ממיינת תמונות לפי תאריך עברי:
- מזינים תיקיית מקור ויעד (נתיבי קבצים מקומיים)
- השרת (Node/Express) סורק וקורא EXIF
- ממיר לתאריך עברי ומעביר/מעתיק לתיקיות יעד

## 🛠️ טכנולוגיות

- **Frontend**: React + Vite + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + @hebcal/core + exif-parser
- **State**: Zustand

## 📁 מבנה הפרויקט

```
hebPhotoSort/
├── docs/                    # תיעוד ואיפיון
│   ├── SPECIFICATION.md
│   ├── TASKS.md
│   ├── AI_GUIDELINES.md
│   └── QUICK_PROMPTS.md
├── client/                  # Frontend (React)
├── server/                  # Backend (Express)
│   └── src/index.js
└── ...
```

## 🚀 התחלה מהירה

### Development
```bash
# בטרמינל אחד - שרת
cd server && npm install
npm run dev   # מאזין ב-4000

# בטרמינל שני - קליינט
cd client && npm install
npm run dev   # רץ ב-5173
```

### Build
```bash
# Build Frontend
cd client && npm run build

# השרת רץ מ-node (אין אריזת Electron)
cd server && npm run start
```

## 📖 תיעוד

- [איפיון מערכת](docs/SPECIFICATION.md)
- [משימות פיתוח](docs/TASKS.md)
- [הנחיות ל-AI](docs/AI_GUIDELINES.md)
- [פרומפטים מהירים](docs/QUICK_PROMPTS.md)

## 📋 פיצ'רים

### Phase 1 (MVP)
- [x] בחירת תיקיות מקור ויעד (הזנת נתיב/Prompt)
- [x] הצגת תמונות
- [x] ניווט בין תמונות
- [x] העברה/העתקה/מחיקה (דרך שרת Node)
- [x] Progress bar

### Phase 2
- [ ] יצירת תת-תיקיות אוטומטית (נוסף מיון לפי תאריך עברי)
- [ ] Multi-select
- [ ] Undo/Redo

## 🖼️ Screenshots

*יתווספו בהמשך*

## 📝 License

MIT

