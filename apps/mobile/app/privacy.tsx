import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { PRIVACY_POLICY_MD } from "../lib/privacy-text.generated";

export default function PrivacyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: true, title: "개인정보처리방침", headerBackTitle: "뒤로" }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text className="text-sm text-gray-800" style={{ lineHeight: 22 }}>
          {PRIVACY_POLICY_MD}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
