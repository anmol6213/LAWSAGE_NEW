import { Hourglass } from 'lucide-react';

export const ComingSoon = ({ title, note }: { title: string; note: string }) => (
  <div className="h-full flex items-center justify-center p-6">
    <div className="max-w-md text-center bg-white rounded-lg shadow-md p-8">
      <Hourglass className="w-10 h-10 text-indigo-600 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-indigo-700 font-medium mb-2">Coming soon</p>
      <p className="text-gray-600 text-sm">{note}</p>
    </div>
  </div>
);
