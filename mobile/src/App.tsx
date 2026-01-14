import React, { useEffect } from "react";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { initObservability, startNavigationTracking } from "./observability";
import TaskManagerScreen from "./screens/TaskManagerScreen";

const Stack = createNativeStackNavigator();

const App: React.FC = () => {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    initObservability();
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => startNavigationTracking(navigationRef)}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="TaskManager" component={TaskManagerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
