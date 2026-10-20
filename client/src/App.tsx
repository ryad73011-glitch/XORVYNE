import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.js';
import { Toaster } from './components/ui/primitives.js';
import { useAppStore } from './state/appStore.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ProjectsScreen } from './screens/ProjectsScreen.js';
import { EditorScreen } from './screens/EditorScreen.js';
import { AssistantScreen } from './screens/AssistantScreen.js';
import { AssetsScreen } from './screens/AssetsScreen.js';
import { ExportScreen } from './screens/ExportScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';

export default function App() {
  const refresh = useAppStore((state) => state.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/editor" element={<EditorScreen />} />
          <Route path="/assistant" element={<AssistantScreen />} />
          <Route path="/assets" element={<AssetsScreen />} />
          <Route path="/export" element={<ExportScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
