function downloadBlob(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export async function shareFiles(files, title) {
  const list = files.map((file) => new File([file.data], file.name, { type: file.type }));
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list, title });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  for (const file of list) downloadBlob(file);
  return 'downloaded';
}
