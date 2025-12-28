import express from 'express'
import cors from 'cors'
import router from './routes/index.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())
app.use('/api', router)

app.listen(PORT, () => {
  console.log(`HebPhotoSort API running on http://localhost:${PORT}`)
})


