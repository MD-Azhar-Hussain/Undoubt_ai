import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '../../src/index.css';
import '../../src/App.css';
import RoomPage from '../../src/pages/RoomPage';
const role = new URLSearchParams(window.location.search).get('role') === 'host' ? 'host' : 'participant';
createRoot(document.getElementById('root')).render(<><p style={{margin:0,padding:'6px 16px',fontSize:12,color:'#cbd5e1'}}>Layout preview · sample data · no live changes</p><MemoryRouter initialEntries={['/room/482916']}><Routes><Route path="/room/:roomId" element={<RoomPage role={role} />} /><Route path="/" element={<p>Back to sessions</p>} /></Routes></MemoryRouter></>);
