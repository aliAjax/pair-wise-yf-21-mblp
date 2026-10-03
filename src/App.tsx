import "./styles.css";
import { StoreProvider } from "./store";
import Header from "./components/Header";
import CarpetList from "./components/CarpetList";
import CarpetDetail from "./components/CarpetDetail";
import { ConflictDialog, OutboxPanel, SyncReportModal, ToastView } from "./components/Overlays";

function App() {
  return (
    <StoreProvider>
      <main className="app">
        <Header />
        <div className="workspace">
          <CarpetList />
          <CarpetDetail />
        </div>
      </main>
      <OutboxPanel />
      <ConflictDialog />
      <SyncReportModal />
      <ToastView />
    </StoreProvider>
  );
}

export default App;
