import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import SpeciesSearch from '../components/SpeciesSearch';

export default function Discover() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  return (
    <main className="page">
      <div className="page-head">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="left" size={26} /></button>
        <div>
          <h1 className="page-title">Discover</h1>
          <p className="page-sub">Search the World Register of Marine Species by any name</p>
        </div>
      </div>
      <SpeciesSearch autoFocus showFilters initialQuery={params.get('q') || ''} />
    </main>
  );
}
