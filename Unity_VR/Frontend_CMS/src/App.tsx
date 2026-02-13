import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ModeSelection from './pages/mode-selection'
import Develop from './pages/develop/indexdevelop'
import './App.css'
import { Toaster } from './components/ui/sonner'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ModeSelection />} />
        <Route path="/develop/*" element={<Develop />} />
      </Routes>
      <Toaster />
    </Router>
  )
}

export default App
