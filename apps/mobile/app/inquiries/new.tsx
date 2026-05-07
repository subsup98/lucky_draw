import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCreateInquiry } from "../../lib/hooks";
import { INQUIRY_CATEGORIES, INQUIRY_CATEGORY_LABEL } from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

const schema = z.object({
  category: z.enum(INQUIRY_CATEGORIES),
  subject: z.string().min(1, "제목을 입력하세요").max(200, "200자 이하"),
  body: z.string().min(1, "내용을 입력하세요").max(5000, "5000자 이하"),
});
type FormValues = z.infer<typeof schema>;

export default function NewInquiryScreen() {
  const router = useRouter();
  const create = useCreateInquiry();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: "ETC", subject: "", body: "" },
  });

  const category = watch("category");

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await create.mutateAsync(values);
      router.back();
    } catch (e) {
      setServerError(apiErrorToKo(e));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "문의하기",
          headerBackTitle: "뒤로",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
          <Text className="text-sm text-gray-700 mb-2">분류</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {INQUIRY_CATEGORIES.map((c) => {
              const selected = c === category;
              return (
                <Pressable
                  key={c}
                  onPress={() => setValue("category", c)}
                  className={`px-3 py-2 rounded-md border ${
                    selected
                      ? "bg-black border-black"
                      : "bg-white border-gray-300"
                  }`}
                >
                  <Text
                    className={`text-sm ${selected ? "text-white" : "text-gray-700"}`}
                  >
                    {INQUIRY_CATEGORY_LABEL[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm text-gray-700 mb-1">제목</Text>
          <Controller
            control={control}
            name="subject"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="제목을 입력하세요"
                className="border border-gray-300 rounded-md px-3 py-3 mb-1"
              />
            )}
          />
          {errors.subject && (
            <Text className="text-xs text-red-500 mb-3">
              {errors.subject.message}
            </Text>
          )}

          <Text className="text-sm text-gray-700 mb-1 mt-3">내용</Text>
          <Controller
            control={control}
            name="body"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="문의 내용을 자세히 적어주세요"
                multiline
                textAlignVertical="top"
                className="border border-gray-300 rounded-md px-3 py-3 mb-1"
                style={{ minHeight: 160 }}
              />
            )}
          />
          {errors.body && (
            <Text className="text-xs text-red-500 mb-3">
              {errors.body.message}
            </Text>
          )}

          {serverError && (
            <View className="rounded-md bg-red-50 px-3 py-2 mt-3 mb-4">
              <Text className="text-sm text-red-600">{serverError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={create.isPending}
            className="bg-black rounded-md py-3 items-center active:opacity-70 disabled:opacity-50 mt-4"
          >
            {create.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">등록</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
