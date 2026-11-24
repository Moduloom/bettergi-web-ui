import {useEffect, useRef, useState, type ReactNode} from 'react';
import {OverlayScrollArea} from 'loom-frame/ui';
import {Button, IconButton, Text, type IconName} from './controls';
import {Navigation} from './collections';
import {DropMenu, WindowFrame} from './overlays';
import {duration} from './motion';
import {useAppValue} from './app-state';
import {useBetterGIConnection} from './app-runtime';
import {useWindowsAccent} from './system-accent';
import {logoSource, useStoredPicture} from './app-images';
import {Image} from './media';
import {PluginPage} from './app-pages';
import {KeyMacroPage} from './app-key-macros';
import {MusicPage} from './app-music';
import {LegacyDragonPage} from './app-legacy-dragon';
import {SchedulerPage} from './app-scheduler';
import {ScriptResourcePage} from './app-script-resources';
import {InventoryPage} from './app-inventory';
import {AccountPage} from './app-accounts';
import {GuideSettings, HomePage, MacroSettings, SettingsPage, type Appearance} from './app-settings';
import {StandaloneTasks} from './app-tasks';
import {RealtimeTriggers} from './app-triggers';
import {HotkeysPage} from './app-hotkeys';
import {PuloniaEditor} from './app-plans';
import {PlanHistory} from './plan-history';
import {useAccounts} from './account-state';
import {FeedDialog} from './app-feed';
import {togglePreviewMode} from './theme';

type AppContext = {
  runtime: ReturnType<typeof useBetterGIConnection>;
  banner: ReturnType<typeof useStoredPicture>;
  background: ReturnType<typeof useStoredPicture>;
  appearance: Appearance;
  navigate: (value: string) => void;
  mapAssetsBase?: string;
};
type AppRoute = {
  value: string; label: string; icon: IconName;
  content: (context: AppContext) => ReactNode;
};
const mainRoutes: AppRoute[] = [
  {value: 'home', label: '启动', icon: 'play', content: ({banner, runtime, navigate}) =>
    <HomePage picture={banner} runtime={runtime} navigate={navigate}/>},
  {value: 'triggers', label: '实时触发', icon: 'activity', content: ({navigate}) => <RealtimeTriggers navigate={navigate}/>},
  {value: 'tasks', label: '独立任务', icon: 'list', content: ({navigate, runtime}) => <StandaloneTasks navigate={navigate} runtime={runtime}/>},
  {value: 'plan', label: '任务计划', icon: 'layers', content: ({navigate}) => <PuloniaEditor mode="plan" navigate={navigate}/>},
  {value: 'new-dragon', label: '新一条龙', icon: 'layers', content: ({navigate}) => <PuloniaEditor mode="new-dragon" navigate={navigate}/>},
  {value: 'history', label: '执行记录', icon: 'clock', content: () => <PlanHistory showHeading/>},
  {value: 'accounts', label: '账户', icon: 'user', content: ({navigate}) => <AccountPage navigate={navigate}/>},
  {value: 'inventory', label: '狛荷屋', icon: 'archive', content: ({navigate}) => <InventoryPage onManageAccounts={() => navigate('accounts')}/>},
  {value: 'dragon', label: '一条龙', icon: 'layers', content: () => <LegacyDragonPage/>},
];
const automationRoutes: AppRoute[] = [
  {value: 'scheduler', label: '调度器', icon: 'timer', content: ({navigate}) => <SchedulerPage navigate={navigate}/>},
  {value: 'scripts', label: 'JS 脚本', icon: 'fileCode', content: () => <ScriptResourcePage kind="scripts"/>},
  {value: 'pathing', label: '地图追踪', icon: 'globe', content: ({mapAssetsBase}) =>
    <ScriptResourcePage kind="pathing" mapAssetsBase={mapAssetsBase}/>},
  {value: 'recordings', label: '录制回放', icon: 'monitor', content: () => <ScriptResourcePage kind="recordings"/>},
];
const tools: AppRoute[] = [
  {value: 'macros', label: '辅助操控', icon: 'sliders', content: ({navigate}) => <MacroSettings navigate={navigate}/>},
  {value: 'key-macros', label: '按键宏', icon: 'code', content: () => <KeyMacroPage/>},
  {value: 'music', label: '自动演奏', icon: 'music', content: () => <MusicPage/>},
  {value: 'guide', label: '悬浮小窗', icon: 'monitor', content: ({navigate}) => <GuideSettings navigate={navigate}/>},
  {value: 'hotkeys', label: '快捷键', icon: 'settings', content: () => <HotkeysPage/>},
  {value: 'notifications', label: '通知', icon: 'bell', content: () => <SettingsPage page="notifications"/>},
];
const footerRoutes: AppRoute[] = [
  {value: 'plugins', label: '插件', icon: 'package', content: ({runtime}) => <PluginPage runtime={runtime}/>},
  {value: 'settings', label: '设置', icon: 'settings', content: ({runtime, background, appearance}) =>
    <SettingsPage page="settings" runtime={runtime} picture={background} appearance={appearance}/>},
];
const routes = [...mainRoutes, ...automationRoutes, ...tools, ...footerRoutes];

export function BetterGIApp({
  title = 'BetterGI', selectedRoute, onRouteChange, compactNavigation, onCompactChange, scene = false,
  accentEndpoint, hostedOrigin, windowTheme, mapAssetsBase,
}: {
  title?: string; selectedRoute?: string; onRouteChange?: (value: string) => void;
  compactNavigation?: boolean; onCompactChange?: (value: boolean) => void; scene?: boolean;
  accentEndpoint?: string; hostedOrigin?: string; windowTheme?: Appearance['windowTheme']; mapAssetsBase?: string;
} = {}) {
  const [localRoute, setRoute] = useAppValue('navigation/page', 'home');
  const [automationOpen, setAutomationOpen] = useState(false);
  const [storedCompact, setCompact] = useAppValue('compact-navigation', false);
  const compact = compactNavigation ?? storedCompact;
  const [windowState, setWindowState] = useState<'normal' | 'maximized' | 'hidden'>('normal');
  const [feedOpen, setFeedOpen] = useState(false);
  const [accounts] = useAccounts();
  const [activeAccount, setActiveAccount] = useAppValue('current-account', '');
  const account = accounts.find(item => item.id === activeAccount);
  const panel = useRef<HTMLDivElement>(null);
  const runtime = useBetterGIConnection(hostedOrigin);
  const banner = useStoredPicture('banner');
  const background = useStoredPicture('background');
  const [opacity, setOpacity] = useAppValue('background/opacity', 35);
  const [stretch, setStretch] = useAppValue('background/stretch', 'cover');
  const [followAccent, setFollowAccent] = useAppValue('appearance/follow-system-accent', true);
  const accentAvailable = useWindowsAccent(followAccent, accentEndpoint);
  const current = routes.find(page => page.value === (selectedRoute ?? localRoute)) ?? routes[0];
  const route = current.value;

  function navigate(value: string) {
    if (value === 'automation') setAutomationOpen(open => !open);
    else (onRouteChange ?? setRoute)(value);
  }

  function toggleMode() {
    if (windowTheme) windowTheme.onChange(document.documentElement.dataset.bgiMode === 'dark' ? 'light' : 'dark');
    else togglePreviewMode();
  }

  useEffect(() => {
    if (automationRoutes.some(page => page.value === route)) {
      setAutomationOpen(true);
    }
  }, [route]);

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const time = duration(element, .7);
    if (!time) return;
    const animation = element.animate([
      {opacity: .65, transform: 'translateY(4px)'},
      {opacity: 1, transform: 'none'},
    ], {duration: time, easing: 'ease-out'});
    return () => animation.cancel();
  }, [current, windowState]);

  const nav = [
    ...mainRoutes,
    {value: 'automation', label: '全自动', icon: 'folder' as const, expanded: automationOpen, children: automationRoutes},
    ...tools,
  ];

  return <div className="bgi-app" data-scene={scene || undefined}>
    {windowState === 'hidden' ? <div className="bgi-app-reopen">
      <Button icon="monitor" onClick={() => setWindowState('normal')}>显示 BetterGI</Button>
    </div> :
      <WindowFrame title={title} iconContent={<Image src={logoSource} width={16} height={16} alt=""/>}
        titleActions={<>
          {accounts.length > 1 && <DropMenu label="切换账户" items={[
            ...accounts.map(({id, name}) => ({id, label: name, checked: id === activeAccount})),
            {id: 'manage-accounts', label: '管理账户', separatorBefore: true},
          ]} trigger={<Button appearance="transparent" className="bgi-title-account" icon="user"
            aria-label="切换账户">{account?.name ?? '未选择账户'}</Button>} onSelect={id => {
            if (id === 'manage-accounts') navigate('accounts');
            else setActiveAccount(id);
          }}/>}
          <IconButton icon="gift" label="获取兑换码信息" appearance="transparent" onClick={() => setFeedOpen(true)}/>
          <IconButton icon="moon" label="切换深浅主题" appearance="transparent" onClick={toggleMode}/>
          <IconButton icon="expand" label="最小化到托盘" appearance="transparent" onClick={() => setWindowState('hidden')}/>
        </>}
        compact maximized={windowState === 'maximized'}
        onMinimize={() => setWindowState('hidden')} onClose={() => setWindowState('hidden')}
        onMaximize={() => setWindowState(windowState === 'maximized' ? 'normal' : 'maximized')}>
        {background.url && <Image className="bgi-app-background" src={background.url} alt=""
          fit={stretch as Parameters<typeof Image>[0]['fit']} style={{opacity: opacity / 100}}/>}
        <div className="bgi-app-layout">
          <aside className="bgi-app-rail">
            <IconButton icon="menu" appearance="transparent" label="切换导航宽度"
              aria-pressed={compact} onClick={() => (onCompactChange ?? setCompact)(!compact)}/>
            <OverlayScrollArea>
              <Navigation items={nav} value={route} compact={compact} onChange={navigate}/>
            </OverlayScrollArea>
            <Navigation label="BetterGI 底部导航" items={footerRoutes} value={route}
              compact={compact} onChange={navigate}/>
          </aside>
          <main className="bgi-app-main" aria-label={current.label}>
            <OverlayScrollArea key={route} className="bgi-app-scroll-content">
              <div className="bgi-app-page bgi-stack" data-page={route} ref={panel}>
                {!['home', 'inventory', 'triggers', 'tasks', 'macros', 'guide', 'hotkeys', 'history', 'accounts', 'scheduler', 'dragon', 'scripts', 'pathing', 'recordings', 'key-macros', 'music', 'plugins', 'settings', 'notifications'].includes(route) && <Text variant="title">{current.label}</Text>}
                {current.content({runtime, banner, background, navigate, mapAssetsBase,
                  appearance: {opacity, setOpacity, stretch, setStretch, followAccent, setFollowAccent, accentAvailable, windowTheme}})}
              </div>
            </OverlayScrollArea>
          </main>
        </div>
      </WindowFrame>}
    <FeedDialog open={feedOpen} onChange={setFeedOpen}/>
  </div>;
}
