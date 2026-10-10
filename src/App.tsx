import { RouterProvider, useRouter } from '@/lib/router';
import { AuthProvider } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Home } from '@/pages/Home';
import { Services } from '@/pages/Services';
import { ServiceDetail } from '@/pages/ServiceDetail';
import { Book } from '@/pages/Book';
import { Track } from '@/pages/Track';
import { Login } from '@/pages/Login';
import { Account } from '@/pages/Account';
import { HowItWorks } from '@/pages/HowItWorks';
import { Gallery } from '@/pages/Gallery';
import { About } from '@/pages/About';
import { FAQs } from '@/pages/FAQs';
import { Contact } from '@/pages/Contact';
import { Privacy } from '@/pages/Privacy';
import { Terms } from '@/pages/Terms';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminLogin } from '@/pages/admin/AdminLogin';

function Routes() {
  const { path } = useRouter();

  // Parse path and query params
  const [basePath, queryString] = path.split('?');
  const segments = basePath.split('/').filter(Boolean);
  const params = new URLSearchParams(queryString || '');

  // Admin routes (no navbar/footer)
  if (segments[0] === 'admin') {
    if (segments.length === 1) return <AdminDashboard />;
    return <AdminDashboard />;
  }
  if (segments[0] === 'admin-login') {
    return <AdminLogin />;
  }

  // Public routes with navbar + footer
  let page: React.ReactNode;
  switch (segments[0]) {
    case undefined:
      page = <Home />;
      break;
    case 'services':
      if (segments[1]) {
        page = <ServiceDetail slug={segments[1]} />;
      } else {
        page = <Services />;
      }
      break;
    case 'book':
      page = <Book preselectedSlug={params.get('service') || undefined} />;
      break;
    case 'track':
      page = <Track />;
      break;
    case 'login':
      page = <Login />;
      break;
    case 'account':
      page = <Account />;
      break;
    case 'how-it-works':
      page = <HowItWorks />;
      break;
    case 'gallery':
      page = <Gallery />;
      break;
    case 'about':
      page = <About />;
      break;
    case 'faqs':
      page = <FAQs />;
      break;
    case 'contact':
      page = <Contact />;
      break;
    case 'privacy-policy':
      page = <Privacy />;
      break;
    case 'terms':
      page = <Terms />;
      break;
    default:
      page = <Home />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{page}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </RouterProvider>
  );
}
