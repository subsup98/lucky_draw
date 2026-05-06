import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * 임시 홈 화면 — 스캐폴딩 검증용.
 * 다음 단계에서 인증 + 실제 홈(배너 + 쿠지 목록)으로 교체.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-gray-900">Lucky Draw</Text>
        <Text className="mt-2 text-base text-gray-500">
          모바일 앱 스캐폴딩 완료
        </Text>
      </View>
    </SafeAreaView>
  );
}
