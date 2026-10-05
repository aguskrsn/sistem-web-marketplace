import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Layouts & Pages placeholders (akan kita buat nanti)
const DefaultLayout = ({ children }) => (
  <div className="app-wrapper">
    {/* Navbar Placeholder */}
    <nav className="navbar">
      <div className="nav-container">
        <div className="logo">Fabiebsky</div>
        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/login">Login</a>
        </div>
      </div>
    </nav>
    <main>{children}</main>
  </div>
);

const Home = () => (
  <div className="home-page">
    <header className="hero">
      <h1>Selamat Datang di Fabiebsky</h1>
      <p>Koleksi vintage & preloved premium pilihan</p>
      <button className="btn acc">Belanja Sekarang</button>
    </header>
  </div>
);

const Login = () => (
  <div className="login-page">
    <div className="login-card card">
      <h2>Masuk</h2>
      <p>Masuk untuk mengelola pesanan Anda</p>
      {/* Tombol Google Login Placeholder */}
      <button className="btn cream" style={{ width: '100%', marginTop: '1rem' }}>
        Lanjutkan dengan Google
      </button>
    </div>
  </div>
);

function App() {
  return (
    <>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<DefaultLayout><Home /></DefaultLayout>} />
        <Route path="/login" element={<DefaultLayout><Login /></DefaultLayout>} />
        {/* Tambahkan route admin, cart, checkout di sini nanti */}
      </Routes>
    </>
  );
}

export default App;
