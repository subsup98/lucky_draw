import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInquiry } from "../../lib/hooks";
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  formatDate,
} from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

export default function InquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inquiry = useInquiry(id);

  if (inquiry.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Stack.Screen
          options={{ headerShown: true, title: "문의 상세", headerBackTitle: "뒤로" }}
        />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (inquiry.error || !inquiry.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Stack.Screen
          options={{ headerShown: true, title: "문의 상세", headerBackTitle: "뒤로" }}
        />
        <Text className="text-sm text-red-500">{apiErrorToKo(inquiry.error)}</Text>
      </SafeAreaView>
    );
  }

  const q = inquiry.data;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{ headerShown: true, title: "문의 상세", headerBackTitle: "뒤로" }}
      />
      <ScrollView className="flex-1 px-6 py-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-xs text-gray-500">
            [{INQUIRY_CATEGORY_LABEL[q.category] ?? q.category}]
          </Text>
          <Text className="text-xs text-gray-500">
            {INQUIRY_STATUS_LABEL[q.status] ?? q.status}
          </Text>
        </View>

        <Text className="text-lg font-semibold mb-1">{q.subject}</Text>
        <Text className="text-xs text-gray-500 mb-4">
          {formatDate(q.createdAt)}
        </Text>

        <Text className="text-sm text-gray-800 leading-6 mb-6 whitespace-pre-wrap">
          {q.body}
        </Text>

        <View className="border-t border-gray-100 pt-4">
          <Text className="text-sm font-semibold mb-2">답변</Text>
          {q.answer ? (
            <>
              <Text className="text-sm text-gray-800 leading-6 whitespace-pre-wrap">
                {q.answer}
              </Text>
              {q.answeredAt && (
                <Text className="text-xs text-gray-500 mt-2">
                  답변 일시: {formatDate(q.answeredAt)}
                </Text>
              )}
            </>
          ) : (
            <Text className="text-sm text-gray-500">아직 답변이 등록되지 않았습니다.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
