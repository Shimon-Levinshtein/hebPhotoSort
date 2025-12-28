# 📋 משימות לפיתוח - HebPhotoSort

> עדכון: הפרויקט רץ כ-React + Node/Express (ללא Electron).

## שלב 0: הקמת הפרויקט
> העתק כל משימה בנפרד ל-Cursor AI Chat

### משימה 0.1 - יצירת פרויקט בסיסי (Client)
```
צור פרויקט React חדש עם Vite בתוך client/:
- שם הפרויקט: hebPhotoSort (package.json ב-client)
- TypeScript: לא (JavaScript)
- הגדר Tailwind CSS
- הגדר shadcn/ui
- הוסף תמיכה ב-RTL
- הגדר alias @ ב-vite.config.js וב-jsconfig.json
```

### משימה 0.2 - הקמת Server (Express)
```
בתיקיית server/:
- package.json עם scripts dev/start
- התקן express, cors, exif-parser, @hebcal/core
- צור src/index.js עם endpoints:
  POST /api/scan
  POST /api/sort
  POST /api/delete
  POST /api/create-folder
  POST /api/exif
- הרץ ב-port 4000
```

---

## שלב 1: UI בסיסי

### משימה 1.1 - Layout ראשי
```
צור את ה-Layout הראשי של האפליקציה:
- Header עם שם האפליקציה ואייקון
- אזור ראשי מחולק לשני חלקים:
  - צד ימין: בחירת תיקיות
  - מרכז: תצוגת תמונה
- Footer עם progress bar
- השתמש ב-shadcn/ui components
- תמיכה מלאה ב-RTL
- Dark theme כברירת מחדל
```

### משימה 1.2 - רכיב בחירת תיקייה (FolderPicker)
```
צור רכיב FolderPicker:
Props:
- label: string (תווית)
- value: string (נתיב נוכחי)
- onSelect: function (callback/prompt)
- onChange: function (עריכת טקסט חופשי)

פונקציונליות:
- שדה טקסט לעריכת הנתיב
- כפתור "קבע נתיב" שפותח prompt (דפדפן)
- אייקון תיקייה
- עיצוב עם shadcn Card component
```

### משימה 1.3 - רכיב תצוגת תמונה (ImagePreview)
```
צור רכיב ImagePreview:
Props:
- src: string (נתיב התמונה)
- alt: string
- onNext: function
- onPrevious: function
- currentIndex: number
- totalCount: number

פונקציונליות:
- הצגת התמונה במרכז
- כפתורי ניווט הבא/הקודם
- מונה (12/156)
- תמיכה בזום בסיסי
- Loading state
```

### משימה 1.4 - רכיב גריד תמונות (ImageGrid)
```
צור רכיב ImageGrid (thumbnails):
Props:
- images: array של נתיבי תמונות
- selectedIndex: number
- onSelect: function

פונקציונליות:
- הצגת thumbnails בגריד
- הדגשת התמונה הנבחרת
- Lazy loading לתמונות
- Scroll אופקי או אנכי
- גודל thumbnail: 60x60px
```

### משימה 1.5 - כפתורי פעולות (SortingControls)
```
צור רכיב SortingControls:
Props:
- onMove: function
- onCopy: function
- onDelete: function
- onCreateFolder: function
- disabled: boolean

פונקציונליות:
- כפתור העבר (עם אייקון)
- כפתור העתק
- כפתור מחק (עם אישור)
- כפתור יצירת תיקייה חדשה
- כל הכפתורים עם tooltips
```

---

## שלב 2: לוגיקה ו-API

### משימה 2.1 - API ב-Express
```
server/src/index.js:
Endpoints:
POST /api/scan            { sourcePath }
POST /api/sort            { src, destRoot, format, mode }
POST /api/delete          { targetPath }
POST /api/create-folder   { targetPath }
POST /api/exif            { targetPath }
GET  /api/health

דרישות:
- סינון קבצי תמונה (jpg, jpeg, png, gif, webp, bmp)
- טיפול שגיאות והחזרת error ברור
```

### משימה 2.2 - React Hook לניהול API
```
צור hook בשם useApi:

const useApi = () => {
  return {
    scanFolder,
    sortByDate,
    deleteFile,
    createFolder,
    readExif,
    loading,
    error,
  }
}

השתמש ב-fetch לכתובת השרת (ברירת מחדל http://localhost:4000).
```

### משימה 2.4 - State Management
```
הגדר Zustand store לניהול state:

src/store/appStore.js:

State:
- sourcePath: string
- destPath: string
- images: array
- currentIndex: number
- sortedCount: number
- loading: boolean
- error: string | null

Actions:
- setSourcePath
- setDestPath
- setImages
- setCurrentIndex
- nextImage
- prevImage
- incrementSorted
- setLoading
- setError
- reset
```

### משימה 2.5 - קריאת EXIF ותאריך יצירה
```
בשרת (Express):
- השתמש ב-exif-parser
- פונקציה: getImageDate(imagePath)
- סדר עדיפות: DateTimeOriginal > CreateDate > ModifyDate > file.birthtime
- החזר תאריך ISO
- Endpoint: POST /api/exif { targetPath }
```

### משימה 2.6 - המרה לתאריך עברי
```
בשרת:
- התקן @hebcal/core
- פונקציה: toHebrewDate(date)
- החזר אובייקט עם:
  {
    full: "כ״ד כסלו תשפ״ה",
    year: "תשפ״ה",
    month: "כסלו",
    day: "כ״ד",
    folderName: "כסלו תשפה"
  }
- פונקציה: buildTargetPath(destRoot, hebrewDate, format)
  format: 'month-year' או 'day-month-year'
```

### משימה 2.7 - מיון אוטומטי לפי תאריך עברי (API)
```
Endpoint: POST /api/sort
1. קלט: src, destRoot, format, mode (move/copy)
2. קרא EXIF ותאריך יצירה
3. המר לתאריך עברי
4. צור תיקייה אם לא קיימת (לפי format)
5. העבר/העתק את הקובץ (mode)
6. החזר: { success, hebrew, newPath }

דוגמה:
Input: { src: "C:\Photos\IMG001.jpg", destRoot: "C:\Sorted\", format: "month-year", mode: "move" }
Output: { success: true, hebrew: "כסלו תשפ״ה", newPath: "C:\Sorted\2024\כסלו תשפה\IMG001.jpg" }
```

---

## שלב 3: חיבור הכל ביחד

### משימה 3.1 - דף הבית המלא
```
חבר את כל הרכיבים בדף Home.jsx:

1. בטעינה: הצג מסך בחירת תיקיות
2. אחרי בחירת שתי התיקיות: טען את התמונות
3. הצג את התמונה הראשונה
4. אפשר ניווט בין תמונות
5. אפשר פעולות מיון (העבר/העתק/מחק)
6. עדכן את ה-progress bar
7. כשנגמרות התמונות: הצג הודעת סיום

קיצורי מקלדת:
- Arrow Right/Left: ניווט בין תמונות
- M: העבר תמונה
- C: העתק תמונה
- Delete: מחק תמונה
```

### משימה 3.2 - טיפול בשגיאות ו-Edge Cases
```
הוסף טיפול בשגיאות:

1. תיקיית מקור ריקה - הצג הודעה מתאימה
2. תיקיית יעד לא קיימת - צור אותה או הצג שגיאה
3. קובץ כבר קיים ביעד - שאל את המשתמש (דרוס/דלג/שנה שם)
4. אין הרשאות - הצג הודעת שגיאה ברורה
5. קובץ לא תמונה - דלג עליו

הוסף Toast notifications להודעות למשתמש.
```

---

## שלב 4: Build ו-Distribution

### משימה 4.1 - Build ו-Deployment (ללא Electron)
```
- Frontend: cd client && npm run build
- Backend: cd server && npm run start
- ודא שקובצי ה-build זמינים ב-client/dist
```

### משימה 4.2 - אופטימיזציות
```
בצע אופטימיזציות לפני release:

1. Lazy loading לתמונות
2. Image caching
3. מניעת memory leaks
4. Bundle size optimization
5. הסרת console.logs
6. Error boundaries
```

---

## 📝 הערות לפיתוח

### סדר עבודה מומלץ:
1. בצע משימות לפי הסדר
2. בדוק כל משימה לפני מעבר לבאה
3. commit אחרי כל משימה שלמה
4. תעד בעיות שנתקלת בהן

### בדיקות ידניות:
- [ ] בחירת תיקייה עובדת
- [ ] תמונות נטענות
- [ ] ניווט בין תמונות עובד
- [ ] **קריאת EXIF עובדת**
- [ ] **תאריך עברי מוצג נכון**
- [ ] **תיקיות נוצרות לפי תאריך עברי**
- [ ] העברת קובץ עובדת
- [ ] העתקת קובץ עובדת
- [ ] מחיקת קובץ עובדת
- [ ] Progress bar מתעדכן
- [ ] קיצורי מקלדת עובדים
- [ ] השרת רץ (npm run start) וה-frontend build נטען (client/dist)

