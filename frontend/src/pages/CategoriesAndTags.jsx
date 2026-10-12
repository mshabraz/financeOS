import { useSearchParams } from 'react-router-dom';
import { Tag, Hash } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import PageHeader from '../components/ui/PageHeader';
import Categories from './Categories';
import Tags from './Tags';

export default function CategoriesAndTags() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'tags' ? 'tags' : 'categories';

  const handleTabChange = (val) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val === 'tags') {
          next.set('tab', 'tags');
        } else {
          next.delete('tab');
        }
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories & Tags"
        subtitle="Organize transactions with budget categories, auto-categorization rules, and multi-purpose tags"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full sm:w-auto flex">
          <TabsTrigger
            value="categories"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]"
          >
            <Tag size={16} />
            Categories & Rules
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]"
          >
            <Hash size={16} />
            Tags & Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-6 focus-visible:outline-none">
          <Categories hideHeader />
        </TabsContent>

        <TabsContent value="tags" className="mt-6 focus-visible:outline-none">
          <Tags hideHeader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
