import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RecipeDocument } from '../../../packages/cooklens-api/types';
import { messageLimit, type createCookingSessionController } from './session-controller';

const progress = {
  create: 'Đang tạo phiên nấu…',
  restore: 'Đang mở phiên đã lưu…',
  action: 'Đang cập nhật bước nấu…',
  message: 'CookLens đang trả lời…',
  refresh: 'Đang tải trạng thái mới nhất…',
};

export function CookingSessionScreen({ controller, Button, onChooseDish, onOpenRecipe, scrollToChat, document }: {
  controller: ReturnType<typeof createCookingSessionController>;
  Button: React.ComponentType<{ title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }>;
  onChooseDish: () => void;
  onOpenRecipe: (document: RecipeDocument) => void;
  scrollToChat: () => void;
  document?: RecipeDocument | null;
}) {
  const { session, busy, error, storageWarning, canAct, canDiscardMessage, canResend, refreshRequired } = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot,
  );
  const seen = useRef({ sessionId: '', count: 0 });
  const sessionId = session?.id ?? '';
  const messageCount = session?.messages.length ?? 0;

  useEffect(() => {
    if (seen.current.sessionId === sessionId && messageCount > seen.current.count) scrollToChat();
    seen.current = { sessionId, count: messageCount };
  }, [sessionId, messageCount, scrollToChat]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void controller.foreground();
      else controller.suspend();
    });
    return () => {
      subscription.remove();
      controller.leave();
    };
  }, [controller]);

  const step = session?.recipe.instructions.find(item => item.step === session.current_step);
  const stepLabel = step && session ? `Bước ${step.step} trên ${session.total_steps}` : null;
  const actionLimit = (session?.history.length ?? 0) >= 99;
  const chatFeedback = !!session && (busy === 'message' || !!error?.relatedToMessage);
  const feedback = <>
    {busy && <View accessibilityLiveRegion="polite" style={styles.card}>
      <ActivityIndicator color="#b84415" />
      <Text style={styles.body}>{progress[busy]}</Text>
    </View>}
    {error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.notice}>
      <Text style={styles.body}>{error.message}</Text>
      {error.retryable && <Button title={refreshRequired ? 'Kiểm tra phiên' : 'Thử lại yêu cầu'} disabled={!!busy}
        onPress={() => { void controller.retry(); }} />}
      {canResend && <Button title="Gửi lại câu hỏi" disabled={!!busy} onPress={() => {
        Keyboard.dismiss();
        void controller.sendMessage();
      }} />}
      {canDiscardMessage && <Button title="Tiếp tục mà không gửi lại" secondary onPress={controller.discardPendingMessage} />}
    </View>}
  </>;

  return <>
    <Text accessibilityRole="header" style={document ? styles.label : styles.title}>{session?.recipe.title ?? document?.recipe.title ?? 'Hướng dẫn nấu'}</Text>
    {!session && !!document && <Button title="Bắt đầu nấu" disabled={!canAct} onPress={() => { void controller.act('start'); }} />}
    {session && <View style={styles.card}>
      {session.status === 'ready' && <Text style={styles.body}>Sẵn sàng. Công thức có {session.total_steps} bước.</Text>}
      {session.status === 'finished' && <Text style={styles.body}>Phiên nấu đã kết thúc.</Text>}
      {step && <View accessible accessibilityLiveRegion="polite" style={styles.step}>
        <Text style={styles.label}>{stepLabel}</Text>
        <Text style={styles.body}>{step.text}</Text>
        {step.duration_minutes !== null && <Text style={styles.body}>{step.duration_minutes} phút</Text>}
      </View>}
      {actionLimit && session.status !== 'finished' && <Text style={styles.body}>
        Phiên đã đạt giới hạn thao tác. Bạn vẫn có thể kết thúc phiên.
      </Text>}
      {session.status === 'ready' && <Button title="Bắt đầu nấu" disabled={!canAct || actionLimit}
        onPress={() => { void controller.act('start'); }} />}
      {session.status === 'cooking' && <>
        <Button title="Bước tiếp theo" disabled={!canAct || actionLimit || session.current_step >= session.total_steps}
          onPress={() => { void controller.act('next'); }} />
        <Button title="Bước trước" secondary disabled={!canAct || actionLimit || session.current_step <= 1}
          onPress={() => { void controller.act('previous'); }} />
      </>}
      {session.status !== 'finished' && <Button title="Kết thúc phiên" secondary disabled={!canAct}
        onPress={() => { void controller.act('finish'); }} />}
      {!document && <Button title={`Xem công thức ${session.recipe.title}`} secondary
        onPress={() => onOpenRecipe({ recipe: session.recipe, corpus_version: session.corpus_version })} />}
    </View>}
    {!chatFeedback && feedback}
    {!busy && session?.status === 'finished' && <Button title="Nấu lại"
      onPress={() => { void controller.openRecipe(document ?? { recipe: session.recipe, corpus_version: session.corpus_version }); }} />}
    {!busy && !document && <Button title="Chọn món" secondary onPress={onChooseDish} />}
    {storageWarning && <Text accessibilityLiveRegion="polite" style={styles.body}>{storageWarning}</Text>}
    {session && (messageCount > 0 || chatFeedback) && <View style={styles.transcript}>
      {session.messages.map((message, index) => <View key={index} style={styles.message}>
        <Text style={styles.label}>{message.role === 'user' ? 'Bạn' : 'CookLens'}</Text>
        <Text selectable accessibilityLiveRegion={index === messageCount - 1 ? 'polite' : 'none'} style={styles.body}>{message.text}</Text>
      </View>)}
      {chatFeedback && feedback}
      {messageCount >= 60 && session.status !== 'finished' && <Text style={styles.body}>
        Phiên đã đạt giới hạn hỏi đáp. Bạn vẫn có thể điều khiển bước nấu.
      </Text>}
    </View>}
  </>;
}

export function CookingComposer({ controller }: {
  controller: ReturnType<typeof createCookingSessionController>;
}) {
  const { session, canSend, draft } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (session?.status === 'finished') return null;
  const canSubmit = canSend && !!draft.trim();
  return <View style={styles.composer}>
    <TextInput accessibilityLabel="Câu hỏi về công thức" accessibilityState={{ disabled: !canSend }}
      editable={canSend} multiline maxLength={messageLimit} placeholder="Hỏi về công thức…"
      placeholderTextColor="#796b61" style={styles.input} value={draft} onChangeText={controller.setDraft} />
    <Pressable accessibilityRole="button" accessibilityLabel="Gửi câu hỏi" disabled={!canSubmit}
      onPress={() => { Keyboard.dismiss(); void controller.sendMessage(); }} style={[styles.send, !canSubmit && styles.disabled]}>
      <Text style={styles.sendIcon}>↑</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontFamily: 'Epilogue', color: '#35271d' },
  label: { fontSize: 18, fontFamily: 'JakartaSemi', color: '#403025' },
  body: { fontSize: 16, fontFamily: 'Jakarta', color: '#4d4037' },
  card: { padding: 20, borderRadius: 24, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#e5d8c5', gap: 14 },
  step: { gap: 8 },
  notice: { padding: 18, borderRadius: 18, backgroundColor: '#fff0e8', borderWidth: 1, borderColor: '#bf4e25', gap: 10 },
  transcript: { gap: 12 },
  message: { backgroundColor: '#f7efe5', borderRadius: 14, padding: 14, gap: 6 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginVertical: 8,
    backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#e5d8c5', borderRadius: 24, padding: 7 },
  input: { flex: 1, minHeight: 44, maxHeight: 108, paddingHorizontal: 8, paddingVertical: 9,
    color: '#403025', fontFamily: 'Jakarta', fontSize: 16 },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#b84415' },
  sendIcon: { color: '#fffdf8', fontSize: 22 },
  disabled: { opacity: .45 },
});
