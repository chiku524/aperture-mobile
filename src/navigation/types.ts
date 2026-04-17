import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Intent: undefined;
  Ledger: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Aperture: { sessionId: string };
  Receipt: { sessionId: string };
  SessionDetail: { sessionId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
