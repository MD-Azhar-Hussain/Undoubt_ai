// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import Doubt from './Doubt';

// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// const DoubtContainer = () => {
//   const [doubts, setDoubts] = useState([]);
//   const [answeredDoubts, setAnsweredDoubts] = useState([]);
//   const [view, setView] = useState('unanswered');

//   useEffect(() => {
//     const fetchDoubts = async () => {
//       const response = await axios.get(`${API_BASE_URL}/doubts`);
//       setDoubts(response.data);
//     };

//     fetchDoubts();
//   }, []);

//   const handleMarkAsAnswered = (id) => {
//     const doubt = doubts.find((d) => d.id === id);
//     setDoubts(doubts.filter((d) => d.id !== id));
//     setAnsweredDoubts([...answeredDoubts, doubt]);
//   };

//   const sortedDoubts = [...doubts, ...answeredDoubts].sort((a, b) => b.upvotes - a.upvotes);

//   return (
//     <div className="flex flex-col items-center mt-10">
//       <div className="flex space-x-4 mb-5">
//         <button
//           className={`p-2 ${view === 'unanswered' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
//           onClick={() => setView('unanswered')}
//         >
//           Unanswered Doubts
//         </button>
//         <button
//           className={`p-2 ${view === 'answered' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
//           onClick={() => setView('answered')}
//         >
//           Answered Doubts
//         </button>
//         <button
//           className={`p-2 ${view === 'top' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
//           onClick={() => setView('top')}
//         >
//           Top Doubts
//         </button>
//       </div>

//       <div className="h-64 overflow-y-scroll w-full max-w-2xl border border-gray-300 rounded-lg">
//         {view === 'unanswered' &&
//           doubts.map((doubt) => (
//             <Doubt key={doubt.id} doubt={doubt} onMarkAsAnswered={handleMarkAsAnswered} />
//           ))}
//         {view === 'answered' &&
//           answeredDoubts.map((doubt) => <Doubt key={doubt.id} doubt={doubt} />)}
//         {view === 'top' &&
//           sortedDoubts.map((doubt) => <Doubt key={doubt.id} doubt={doubt} />)}
//       </div>
//     </div>
//   );
// };

// export default DoubtContainer;